import type { NextAuthConfig } from "next-auth";

/** Rutas accesibles sin sesión. */
export const PUBLIC_PREFIXES = [
  "/login",
  "/recuperar",
  "/restablecer",
  "/invitacion",
  "/acceso",
  "/pagar",
  "/verificar",
  "/c/",
  "/activo/",
  "/offline",
  "/politica-datos",
  "/api/auth",
  "/api/webhooks",
  "/api/public",
  "/api/docs",
  "/api/v1",
  "/api/pagos/simulador",
  "/api/track",
  "/api/files",
  "/manifest.webmanifest",
  "/sw.js",
  "/icons",
  "/plantillas",
];

export function isPublicPath(pathname: string) {
  if (pathname === "/") return false;
  return PUBLIC_PREFIXES.some((p) => (p.endsWith("/") ? pathname.startsWith(p) : pathname === p || pathname.startsWith(p + "/")));
}

/** Configuración compatible con Edge (middleware): sin acceso a BD. */
export const authConfig = {
  pages: { signIn: "/login" },
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  trustHost: true,
  providers: [],
  callbacks: {
    // La redirección se decide en middleware.ts (401 JSON para /api, redirect para páginas).
    authorized() {
      return true;
    },
    session({ session, token }) {
      if (token.uid) {
        session.user.id = token.uid as string;
        session.conjuntoId = (token.cid as string | undefined) ?? null;
        session.rol = (token.rol as string | undefined) ?? null;
        session.sv = (token.sv as number | undefined) ?? 0;
        session.superAdmin = !!token.su;
        session.impersonadoPor = (token.imp as string | undefined) ?? null;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
