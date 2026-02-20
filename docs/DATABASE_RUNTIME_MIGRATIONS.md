# Base de Datos: Runtime + Migraciones (Ofistur)

Este documento deja una convención única para evitar desalineaciones entre:

- la DB que usa la app en runtime (`DATABASE_URL`), y
- la DB donde Prisma aplica migraciones (`DIRECT_URL`).

## 1) Hallazgo clave en DigitalOcean (capturas)

En este cluster:

- Existe un **pool** llamado `ofistur-app`.
- Ese pool está configurado sobre la DB real `defaultdb`.

Eso significa que la URL pool puede verse como:

- `...:25061/ofistur-app?...`

pero el backend real termina siendo:

- `defaultdb`

## 2) Regla operativa obligatoria

`DATABASE_URL` y `DIRECT_URL` deben resolver a la **misma DB real**.

Si runtime y migraciones apuntan a DB distintas, aparecen errores como:

- `P2021: The table ... does not exist`
- migraciones "aplicadas" pero tablas ausentes en runtime

## 3) Convención de `.env` para este cluster

Ejemplo alineado:

```bash
# Runtime (pool)
DATABASE_URL="postgresql://...:25061/ofistur-app?sslmode=require&pgbouncer=true&connection_limit=1&pool_timeout=15"

# Migraciones / DDL directo (misma DB real que runtime)
DIRECT_URL="postgresql://...:25060/defaultdb?sslmode=require"

# Shadow solo para migrate dev
SHADOW_DATABASE_URL="postgresql://...:25060/ofistur-shadow?sslmode=require"
```

Nota: `ofistur-app` en el path del pool es el nombre del pool, no necesariamente la DB real.

## 4) Checklist antes de migrar

1. Correr:
   - `npm run db:check-alignment`
2. Verificar resultado:
   - `Resultado: OK - runtime y migraciones están alineados.`
3. Recién ahí aplicar:
   - `npx prisma migrate deploy`

## 5) Flujo recomendado (dev/staging/prod)

1. `source .env`
2. `npm run db:check-alignment`
3. `npx prisma migrate deploy`
4. `npx prisma generate`
5. reiniciar server (`npm run dev` / deploy)
6. smoke test de endpoints críticos

## 6) Qué hacer si aparece P2021

1. `npm run db:check-alignment`
2. Si hay desalineación:
   - corregir `DIRECT_URL` para que apunte a la misma DB real que `DATABASE_URL`
3. volver a correr migraciones
4. reiniciar app

## 6.1) Qué hacer si aparece P3018 (ej. columna ya existe)

Caso típico:

- migración pendiente histórica (agregada después) que intenta crear algo que ya existe.
- error ejemplo: `column "profile_key" of relation "Client" already exists`.

Flujo recomendado:

1. inspeccionar la migración que falla:
   - `prisma/migrations/<migration_name>/migration.sql`
2. validar que los cambios de esa migración ya existan en DB:
   - columnas/índices/tablas objetivo
3. si ya existen, marcar migración como aplicada (sin re-ejecutarla):
   - `npx prisma migrate resolve --applied <migration_name>`
4. reintentar:
   - `npx prisma migrate deploy`

Ejemplo real en este repo:

```bash
npx prisma migrate resolve --applied 20260214142000_client_profiles
npx prisma migrate deploy
```

Si vuelve a fallar con otra migración histórica, repetir el mismo proceso (validar primero, luego `resolve`).

## 7) Notas Prisma en este repo

- `prisma/schema.prisma` usa:
  - `url = env("DATABASE_URL")`
  - `directUrl = env("DIRECT_URL")`
- `src/lib/prisma.ts` en dev usa `DATABASE_URL` por defecto.
- Solo para debug puntual se puede forzar directo:
  - `PRISMA_USE_DIRECT_IN_DEV=true`

## 8) Política para futuros prompts/PRs

Cada PR que agregue tablas o columnas debe incluir:

1. migración Prisma
2. `npm run db:check-alignment` antes de validar endpoints
3. nota de qué DB/pool fue usada
4. evitar agregar migraciones retroactivas con timestamp viejo; si es necesario, documentar plan de `migrate resolve`

Con eso evitamos el estado "migró bien pero runtime no ve tablas".
