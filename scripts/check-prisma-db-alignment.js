#!/usr/bin/env node

/**
 * Verifica que runtime (DATABASE_URL) y admin (DIRECT_URL) apunten a la misma
 * base de datos real y tengan el mismo estado de tablas críticas.
 *
 * Uso:
 *   node scripts/check-prisma-db-alignment.js
 *   DATABASE_URL=... DIRECT_URL=... node scripts/check-prisma-db-alignment.js
 */

let PrismaClientCtor = null;
let readFileFn = null;

async function getPrismaClientCtor() {
  if (PrismaClientCtor) return PrismaClientCtor;
  const mod = await import("@prisma/client");
  PrismaClientCtor = mod.PrismaClient;
  return PrismaClientCtor;
}

async function getReadFileFn() {
  if (readFileFn) return readFileFn;
  const mod = await import("node:fs/promises");
  readFileFn = mod.readFile;
  return readFileFn;
}

async function loadEnvFileIfExists(filePath) {
  const readFile = await getReadFileFn();
  let raw = "";
  try {
    raw = await readFile(filePath, "utf8");
  } catch (error) {
    if (error && error.code === "ENOENT") return;
    throw error;
  }

  const lines = raw.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const clean = trimmed.startsWith("export ")
      ? trimmed.slice("export ".length).trim()
      : trimmed;
    const eq = clean.indexOf("=");
    if (eq <= 0) continue;

    const key = clean.slice(0, eq).trim();
    if (!key) continue;
    if (process.env[key] !== undefined) continue;

    let value = clean.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}

async function hydrateEnvFromDotEnv() {
  await loadEnvFileIfExists(".env.local");
  await loadEnvFileIfExists(".env");
}

const CRITICAL_TABLES = [
  "_prisma_migrations",
  "User",
  "Agency",
  "BillingFxRate",
  "AgencyBillingSubscription",
];

const WATCH_MIGRATIONS = [
  "20260214142000_client_profiles",
  "20260623140000_billing_recurring_pr1",
];

function redactUrl(raw) {
  if (!raw) return "(vacía)";
  try {
    const parsed = new URL(raw);
    if (parsed.password) parsed.password = "***";
    return parsed.toString();
  } catch {
    return "(url inválida)";
  }
}

function tableExistsSql(tableName) {
  return `
    exists (
      select 1
      from information_schema.tables
      where table_schema = 'public'
        and table_name = '${tableName}'
    )
  `;
}

async function inspect(label, url) {
  const PrismaClient = await getPrismaClientCtor();
  const prisma = new PrismaClient({
    datasources: { db: { url } },
  });

  try {
    const [meta] = await prisma.$queryRawUnsafe(`
      select
        current_database() as db,
        current_schema() as schema,
        (
          select count(*)::int
          from information_schema.tables
          where table_schema = 'public'
        ) as public_table_count,
        ${tableExistsSql("_prisma_migrations")} as has_prisma_migrations,
        ${tableExistsSql("User")} as has_user,
        ${tableExistsSql("Agency")} as has_agency,
        ${tableExistsSql("BillingFxRate")} as has_billing_fx_rate,
        ${tableExistsSql("AgencyBillingSubscription")} as has_billing_subscription
    `);

    let latestMigrations = [];
    let watchMigrations = [];
    if (meta?.has_prisma_migrations) {
      latestMigrations = await prisma.$queryRawUnsafe(`
        select migration_name
        from "public"."_prisma_migrations"
        order by finished_at desc nulls last, started_at desc
        limit 5
      `);

      const watchListSql = WATCH_MIGRATIONS.map((m) => `'${m}'`).join(", ");
      watchMigrations = await prisma.$queryRawUnsafe(`
        select
          migration_name,
          finished_at is not null as is_finished,
          rolled_back_at is not null as is_rolled_back
        from "public"."_prisma_migrations"
        where migration_name in (${watchListSql})
        order by migration_name asc
      `);
    }

    return {
      label,
      ok: true,
      url: redactUrl(url),
      meta,
      latestMigrations: latestMigrations.map((m) => m.migration_name),
      watchMigrations,
    };
  } catch (error) {
    return {
      label,
      ok: false,
      url: redactUrl(url),
      error:
        error && typeof error.message === "string"
          ? error.message
          : String(error),
    };
  } finally {
    await prisma.$disconnect();
  }
}

function printInspection(result) {
  console.log(`\n[${result.label}]`);
  console.log(`url: ${result.url}`);
  if (!result.ok) {
    console.log(`status: ERROR`);
    console.log(`error: ${result.error}`);
    return;
  }

  const m = result.meta;
  console.log(`status: OK`);
  console.log(`db: ${m.db}`);
  console.log(`schema: ${m.schema}`);
  console.log(`public_table_count: ${m.public_table_count}`);
  console.log(`has _prisma_migrations: ${m.has_prisma_migrations}`);
  console.log(`has User: ${m.has_user}`);
  console.log(`has Agency: ${m.has_agency}`);
  console.log(`has BillingFxRate: ${m.has_billing_fx_rate}`);
  console.log(`has AgencyBillingSubscription: ${m.has_billing_subscription}`);
  if (result.latestMigrations.length > 0) {
    console.log(`latest migrations:`);
    for (const name of result.latestMigrations) {
      console.log(`- ${name}`);
    }
  }
  if (result.watchMigrations.length > 0) {
    console.log(`watch migrations:`);
    for (const m of result.watchMigrations) {
      console.log(
        `- ${m.migration_name}: finished=${m.is_finished}, rolled_back=${m.is_rolled_back}`,
      );
    }
  } else if (m.has_prisma_migrations) {
    console.log(`watch migrations: sin registros para ${WATCH_MIGRATIONS.join(", ")}`);
  }
}

function evaluate(runtime, direct) {
  const issues = [];

  if (!runtime.ok) issues.push("DATABASE_URL no se pudo consultar.");
  if (!direct.ok) issues.push("DIRECT_URL no se pudo consultar.");
  if (!runtime.ok || !direct.ok) return issues;

  if (runtime.meta.db !== direct.meta.db) {
    issues.push(
      `DB distinta: DATABASE_URL=${runtime.meta.db} vs DIRECT_URL=${direct.meta.db}.`,
    );
  }

  if (runtime.meta.schema !== direct.meta.schema) {
    issues.push(
      `Schema distinta: DATABASE_URL=${runtime.meta.schema} vs DIRECT_URL=${direct.meta.schema}.`,
    );
  }

  for (const tableName of CRITICAL_TABLES) {
    const key = `has_${tableName.toLowerCase().replace(/[^a-z0-9]/g, "_")}`;
    const runtimeHas = runtime.meta[key];
    const directHas = direct.meta[key];
    if (runtimeHas !== directHas) {
      issues.push(
        `Tabla desalineada (${tableName}): runtime=${runtimeHas} direct=${directHas}.`,
      );
    }
  }

  return issues;
}

async function main() {
  await hydrateEnvFromDotEnv();

  const runtimeUrl = process.env.DATABASE_URL;
  const directUrl = process.env.DIRECT_URL;

  if (!runtimeUrl || !directUrl) {
    console.error(
      "Faltan variables. Requeridas: DATABASE_URL y DIRECT_URL en el entorno.",
    );
    process.exit(2);
  }

  const [runtime, direct] = await Promise.all([
    inspect("DATABASE_URL (runtime)", runtimeUrl),
    inspect("DIRECT_URL (admin/migrate)", directUrl),
  ]);

  printInspection(runtime);
  printInspection(direct);

  const issues = evaluate(runtime, direct);
  if (issues.length === 0) {
    console.log("\nResultado: OK - runtime y migraciones están alineados.");
    process.exit(0);
  }

  console.log("\nResultado: DESALINEADO");
  for (const issue of issues) {
    console.log(`- ${issue}`);
  }
  process.exit(1);
}

main().catch((error) => {
  console.error("Error inesperado:", error);
  process.exit(1);
});
