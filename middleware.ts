import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig, isPublicPath } from "@/lib/auth/config";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const logged = !!req.auth?.user;

  if (pathname === "/") {
    return NextResponse.redirect(new URL(logged ? "/inicio" : "/login", req.url));
  }
  if (!logged && !isPublicPath(pathname)) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }
    const url = new URL("/login", req.url);
    url.searchParams.set("next", pathname + req.nextUrl.search);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icons/|.*\\.(?:png|jpg|jpeg|svg|webp|ico|txt|xml|xlsx|csv)$).*)"],
};
