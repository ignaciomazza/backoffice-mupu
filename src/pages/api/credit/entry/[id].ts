import { NextApiRequest, NextApiResponse } from "next";
import prisma, { Prisma } from "@/lib/prisma";
import { jwtVerify, JWTPayload } from "jose";
import { getFinanceSectionGrants } from "@/lib/accessControl";
import { canAccessFinanceSection } from "@/utils/permissions";

/* ================== Tipos ================== */
type TokenPayload = JWTPayload & {
  id_user?: number;
  userId?: number;
  uid?: number;
  id_agency?: number;
  agencyId?: number;
  aid?: number;
  role?: string;
  email?: string;
};
type DecodedAuth = {
  id_user: number;
  id_agency: number;
  role: string; // en minúscula
  email?: string;
};

/* ================== Constantes ================== */
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error("JWT_SECRET no configurado");

/* ================== Helpers comunes ================== */
function getTokenFromRequest(req: NextApiRequest): string | null {
  if (req.cookies?.token) return req.cookies.token;
  const auth = req.headers.authorization || "";
  if (auth.startsWith("Bearer ")) return auth.slice(7);
  const c = req.cookies || {};
  for (const k of [
    "session",
    "auth_token",
    "access_token",
    "next-auth.session-token",
  ]) {
    const v = c[k];
    if (typeof v === "string" && v) return v;
  }
  return null;
}

async function getUserFromAuth(
  req: NextApiRequest,
): Promise<DecodedAuth | null> {
  try {
    const token = getTokenFromRequest(req);
    if (!token) return null;

    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(JWT_SECRET),
    );
    const p = payload as TokenPayload;

    const id_user = Number(p.id_user ?? p.userId ?? p.uid) || undefined;
    const id_agency = Number(p.id_agency ?? p.agencyId ?? p.aid) || undefined;
    const role = String(p.role || "").toLowerCase();
    const email = p.email;

    if (!id_user && email) {
      const u = await prisma.user.findUnique({
        where: { email },
        select: { id_user: true, id_agency: true, role: true, email: true },
      });
      if (u) {
        return {
          id_user: u.id_user,
          id_agency: u.id_agency,
          role: (role || u.role || "").toLowerCase(),
          email: u.email ?? undefined,
        };
      }
    }

    if (id_user && !id_agency) {
      const u = await prisma.user.findUnique({
        where: { id_user },
        select: { id_agency: true, role: true, email: true },
      });
      if (u) {
        return {
          id_user,
          id_agency: u.id_agency,
          role: role || u.role.toLowerCase(),
          email: email ?? u.email ?? undefined,
        };
      }
    }

    if (!id_user || !id_agency) return null;
    return { id_user, id_agency, role, email: email ?? undefined };
  } catch {
    return null;
  }
}

function toLocalDate(v?: string | null): Date | undefined {
  if (!v) return undefined;
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m)
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0);
  const d = new Date(v);
  return isNaN(d.getTime()) ? undefined : d;
}

function hasFinanceAdminRights(role: string): boolean {
  const r = role.toLowerCase();
  return r === "gerente" || r === "administrativo" || r === "desarrollador";
}

// ----- Signo por tipo -----
const DOC_SIGN: Record<string, number> = {
  investment: -1,
  receipt: 1,

  // NUEVOS: ajustes manuales
  adjust_up: 1,
  adjust_down: -1,
};

const normDoc = (s?: string | null) => (s || "").trim().toLowerCase();
const signForDocType = (dt?: string | null) => DOC_SIGN[normDoc(dt)] ?? 1;
const deltaDecimal = (amountAbs: number, dt?: string | null) =>
  new Prisma.Decimal(Math.abs(amountAbs)).mul(signForDocType(dt));

/* ================== Handler ================== */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  // auth
  const auth = await getUserFromAuth(req);
  if (!auth?.id_user || !auth.id_agency) {
    return res.status(401).json({ error: "No autenticado o token inválido." });
  }

  const financeGrants = await getFinanceSectionGrants(
    auth.id_agency,
    auth.id_user,
  );
  const canCredits = canAccessFinanceSection(
    auth.role,
    financeGrants,
    "credits",
  );
  if (!canCredits) {
    return res.status(403).json({ error: "Sin permisos" });
  }

  // path param
  const idRaw = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;
  const entryId = Number(idRaw);
  if (!Number.isFinite(entryId) || entryId <= 0) {
    return res.status(400).json({ error: "N° de movimiento inválido." });
  }

  // Traer entry p/ validar agencia & enlaces
  const existing = await prisma.creditEntry.findUnique({
    where: { id_entry: entryId },
    include: {
      account: {
        include: {
          client: {
            select: { id_client: true, first_name: true, last_name: true },
          },
          operator: { select: { id_operator: true, name: true } },
        },
      },
    },
  });

  if (!existing) {
    return res.status(404).json({ error: "Movimiento no encontrado." });
  }
  if (existing.id_agency !== auth.id_agency) {
    return res.status(403).json({ error: "No autorizado para esta agencia." });
  }

  // ========= GET /api/credit/entry/:id =========
  if (req.method === "GET") {
    try {
      const entry = await prisma.creditEntry.findUnique({
        where: { id_entry: entryId },
        include: {
          account: {
            include: {
              client: {
                select: { id_client: true, first_name: true, last_name: true },
              },
              operator: { select: { id_operator: true, name: true } },
            },
          },
          booking: { select: { id_booking: true, details: true } },
          receipt: { select: { id_receipt: true, receipt_number: true } },
          investment: { select: { id_investment: true, description: true } },
          operatorDue: { select: { id_due: true, concept: true } },
          createdBy: {
            select: {
              id_user: true,
              first_name: true,
              last_name: true,
              email: true,
            },
          },
        },
      });
      return res.status(200).json(entry);
    } catch (e) {
      console.error("[credit/entry/:id][GET]", e);
      return res.status(500).json({ error: "Error al obtener el movimiento." });
    }
  }

  // ========= PUT /api/credit/entry/:id =========
  if (req.method === "PUT") {
    if (!hasFinanceAdminRights(auth.role)) {
      return res
        .status(403)
        .json({ error: "No autorizado para editar movimientos." });
    }

    try {
      const { concept, value_date, doc_type, reference } = (req.body ?? {}) as {
        concept?: string;
        value_date?: string | null;
        doc_type?: string | null;
        reference?: string | null;
      };

      // Sanitizar
      const data: {
        concept?: string;
        value_date?: Date | null;
        doc_type?: string | null;
        reference?: string | null;
      } = {};

      if (typeof concept === "string") {
        const v = concept.trim();
        if (!v)
          return res.status(400).json({ error: "concept no puede ser vacío." });
        data.concept = v;
      }

      if (value_date !== undefined) {
        if (value_date === null || value_date === "") {
          data.value_date = null;
        } else {
          const vd = toLocalDate(String(value_date));
          if (!vd)
            return res.status(400).json({ error: "value_date inválida." });
          data.value_date = vd;
        }
      }

      const willChangeDocType =
        doc_type !== undefined &&
        normDoc(doc_type) !== normDoc(existing.doc_type);
      if (doc_type !== undefined) {
        const dt = typeof doc_type === "string" ? doc_type.trim() : "";
        data.doc_type = dt || null;
      }

      if (reference !== undefined) {
        const ref = typeof reference === "string" ? reference.trim() : "";
        data.reference = ref || null;
      }

      if (Object.keys(data).length === 0) {
        return res
          .status(400)
          .json({ error: "No hay campos para actualizar." });
      }

      // Si cambia doc_type, ajustar saldo por diferencia de signo
      const updated = await prisma.$transaction(async (tx) => {
        if (willChangeDocType) {
          const before = await tx.creditEntry.findUnique({
            where: { id_entry: entryId },
            select: { amount: true, doc_type: true, account_id: true },
          });
          if (!before) throw new Error("Movimiento inexistente (TX).");

          const acc = await tx.creditAccount.findUnique({
            where: { id_credit_account: before.account_id },
            select: { balance: true },
          });
          if (!acc) throw new Error("Cuenta inexistente (TX).");

          const oldSign = signForDocType(before.doc_type);
          const newSign = signForDocType(data.doc_type ?? before.doc_type);
          if (oldSign !== newSign) {
            const amt = new Prisma.Decimal(before.amount);
            // diff = (nuevo efecto) - (efecto previo)
            const diff = amt.mul(newSign).minus(amt.mul(oldSign));
            const next = acc.balance.add(diff);
            await tx.creditAccount.update({
              where: { id_credit_account: before.account_id },
              data: { balance: next },
            });
          }
        }

        return tx.creditEntry.update({
          where: { id_entry: entryId },
          data,
          include: {
            account: {
              include: {
                client: {
                  select: {
                    id_client: true,
                    first_name: true,
                    last_name: true,
                  },
                },
                operator: { select: { id_operator: true, name: true } },
              },
            },
            booking: { select: { id_booking: true, details: true } },
            receipt: { select: { id_receipt: true, receipt_number: true } },
            investment: { select: { id_investment: true, description: true } },
            operatorDue: { select: { id_due: true, concept: true } },
            createdBy: {
              select: {
                id_user: true,
                first_name: true,
                last_name: true,
                email: true,
              },
            },
          },
        });
      });

      return res.status(200).json(updated);
    } catch (e) {
      console.error("[credit/entry/:id][PUT]", e);
      return res
        .status(500)
        .json({ error: "Error al actualizar el movimiento." });
    }
  }

  // ========= DELETE /api/credit/entry/:id =========
  if (req.method === "DELETE") {
    if (!hasFinanceAdminRights(auth.role)) {
      return res
        .status(403)
        .json({ error: "No autorizado para eliminar movimientos." });
    }

    const allowLinked =
      String(
        Array.isArray(req.query.allowLinked)
          ? req.query.allowLinked[0]
          : (req.query.allowLinked ?? ""),
      )
        .toLowerCase()
        .trim() === "1" ||
      String(req.query.allowLinked).toLowerCase() === "true";

    // viejo guard:
    if (
      existing.receipt_id ||
      existing.operator_due_id ||
      existing.booking_id ||
      (existing.investment_id && !allowLinked) // 👈 si es de investment, permitir con allowLinked=1
    ) {
      return res.status(409).json({
        error:
          "No se puede eliminar: el movimiento está vinculado a otro documento. " +
          "Revertí desde el flujo original o generá un contra-asiento.",
      });
    }

    try {
      const deleted = await prisma.$transaction(async (tx) => {
        const entry = await tx.creditEntry.findUnique({
          where: { id_entry: entryId },
          select: {
            id_agency: true,
            account_id: true,
            amount: true,
            doc_type: true,
          },
        });
        if (!entry)
          throw new Error("Movimiento no encontrado durante la transacción.");
        if (entry.id_agency !== auth.id_agency) {
          throw new Error("No autorizado para esta agencia.");
        }

        const account = await tx.creditAccount.findUnique({
          where: { id_credit_account: entry.account_id },
          select: { balance: true },
        });
        if (!account) throw new Error("Cuenta no encontrada.");

        // Se revierte el efecto aplicado en el alta:
        // balance nuevo = balance actual - (signo(doc_type) * amount)
        const delta = deltaDecimal(Number(entry.amount), entry.doc_type);
        const next = account.balance.minus(delta);

        await tx.creditAccount.update({
          where: { id_credit_account: entry.account_id },
          data: { balance: next },
        });

        return tx.creditEntry.delete({ where: { id_entry: entryId } });
      });

      return res
        .status(200)
        .json({ message: "Movimiento eliminado.", deleted });
    } catch (e) {
      console.error("[credit/entry/:id][DELETE]", e);
      const msg =
        e instanceof Error ? e.message : "Error eliminando el movimiento.";
      if (msg.includes("No autorizado para esta agencia")) {
        return res.status(403).json({ error: msg });
      }
      return res.status(500).json({ error: "Error eliminando el movimiento." });
    }
  }

  res.setHeader("Allow", ["GET", "PUT", "DELETE"]);
  return res.status(405).end(`Method ${req.method} Not Allowed`);
}
