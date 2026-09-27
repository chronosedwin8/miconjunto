import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/lib/db";
import { authConfig } from "./config";
import { consumeToken } from "./tokens";

async function pickConjunto(usuarioId: string, preferido?: string | null) {
  const membresias = await prisma.membresiaConjunto.findMany({
    where: { usuarioId, estado: "ACTIVA", deletedAt: null, conjunto: { deletedAt: null } },
    include: { rol: true },
    orderBy: { createdAt: "asc" },
  });
  const m = (preferido && membresias.find((x) => x.conjuntoId === preferido)) || (membresias.length === 1 ? membresias[0] : null);
  return { membresia: m, total: membresias.length };
}

export const { handlers, auth, signIn, signOut, unstable_update } = NextAuth({
  ...authConfig,
  providers: [
    // Único proveedor: consume un token de un solo uso emitido tras validar contraseña/MFA
    // (login con clave) o enviado por correo (enlace mágico).
    Credentials({
      id: "token",
      name: "Token",
      credentials: { token: { type: "text" } },
      async authorize(credentials) {
        const raw = String(credentials?.token ?? "");
        if (!raw) return null;
        const t = await consumeToken("MAGIC_LINK", raw);
        if (!t) return null;
        const user = await prisma.usuario.findFirst({
          where: t.usuarioId ? { id: t.usuarioId } : { email: t.email ?? "" },
        });
        if (!user || user.deletedAt || user.estado === "BLOQUEADO" || user.estado === "INACTIVO") return null;
        await prisma.usuario.update({
          where: { id: user.id },
          data: { ultimoAcceso: new Date(), intentosFallidos: 0, estado: user.estado === "INVITADO" ? "ACTIVO" : user.estado },
        });
        const data = (t.data ?? {}) as { conjuntoId?: string };
        return { id: user.id, name: user.nombre, email: user.email, conjuntoId: data.conjuntoId ?? null } as never;
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user, trigger, session }) {
      if (user) {
        const u = await prisma.usuario.findUnique({ where: { id: (user as { id: string }).id } });
        if (!u) return token;
        token.uid = u.id;
        token.su = u.esSuperAdmin;
        token.sv = u.sessionVersion;
        token.imp = undefined;
        const { membresia } = await pickConjunto(u.id, (user as { conjuntoId?: string }).conjuntoId);
        token.cid = membresia?.conjuntoId;
        token.rol = membresia?.rol.clave;
      }
      if (trigger === "update" && session && typeof session === "object") {
        const s = session as { conjuntoId?: string; impersonar?: string; salirImpersonacion?: boolean };
        if (s.conjuntoId) {
          const uid = token.uid as string;
          const u = await prisma.usuario.findUnique({ where: { id: uid } });
          const m = await prisma.membresiaConjunto.findFirst({
            where: { usuarioId: uid, conjuntoId: s.conjuntoId, estado: "ACTIVA", deletedAt: null },
            include: { rol: true },
          });
          if (m) {
            token.cid = m.conjuntoId;
            token.rol = m.rol.clave;
          } else if (u?.esSuperAdmin) {
            token.cid = s.conjuntoId;
            token.rol = "ADMINISTRADOR";
          }
        }
        if (s.impersonar && token.su && !token.imp) {
          const target = await prisma.usuario.findUnique({ where: { id: s.impersonar } });
          if (target) {
            token.imp = token.uid;
            token.uid = target.id;
            token.su = false;
            token.sv = target.sessionVersion;
            const { membresia } = await pickConjunto(target.id, token.cid as string | undefined);
            token.cid = membresia?.conjuntoId;
            token.rol = membresia?.rol.clave;
          }
        }
        if (s.salirImpersonacion && token.imp) {
          const original = await prisma.usuario.findUnique({ where: { id: token.imp as string } });
          if (original) {
            token.uid = original.id;
            token.su = original.esSuperAdmin;
            token.sv = original.sessionVersion;
            token.imp = undefined;
          }
        }
      }
      return token;
    },
  },
});
