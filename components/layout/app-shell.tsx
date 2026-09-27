import Link from "next/link";
import { prisma } from "@/lib/db";
import type { Ctx } from "@/lib/auth/context";
import { bottomNavFor, visibleNav } from "@/lib/nav";
import { iaDisponible } from "@/lib/ia/disponible";
import { BottomNav } from "./bottom-nav";
import { Sidebar } from "./sidebar";
import { GlobalSearch } from "./global-search";
import { NotificationBell } from "./notification-bell";
import { UserMenu } from "./user-menu";
import { TextSizeSync } from "./text-size-sync";
import { ImpersonationBanner } from "./impersonation-banner";
import { PanicButton } from "./panic-button";

export async function AppShell({ ctx, children }: { ctx: Ctx; children: React.ReactNode }) {
  const [unread, membresias] = await Promise.all([
    prisma.notificacion.count({ where: { usuarioId: ctx.userId, leida: false, deletedAt: null } }),
    prisma.membresiaConjunto.count({ where: { usuarioId: ctx.userId, estado: "ACTIVA", deletedAt: null } }),
  ]);
  const ia = iaDisponible(ctx);
  const groups = visibleNav(ctx, ia);
  const bottom = bottomNavFor(ctx.rolBase, ctx.permisos, ctx.esSuperAdmin);
  const color = ctx.conjunto.colorPrimario || "#0f766e";
  const residencial = ["PROPIETARIO", "RESIDENTE", "CONVIVIENTE"].includes(ctx.rolBase);

  return (
    <div className="flex min-h-dvh" style={{ ["--brand" as string]: color }}>
      <TextSizeSync large={ctx.textoGrande} />
      <Sidebar groups={groups} conjuntoNombre={ctx.conjunto.nombre} logoUrl={ctx.conjunto.logoUrl} />
      <div className="flex min-w-0 flex-1 flex-col">
        {ctx.impersonadoPor && <ImpersonationBanner nombre={ctx.nombre} />}
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 lg:px-6">
          <Link href="/inicio" className="flex min-w-0 items-center gap-2 lg:hidden">
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
              {ctx.conjunto.nombre.slice(0, 1)}
            </span>
            <span className="truncate text-sm font-semibold">{ctx.conjunto.nombre}</span>
          </Link>
          <div className="hidden flex-1 lg:block">
            <GlobalSearch />
          </div>
          <div className="ml-auto flex items-center gap-1">
            <div className="lg:hidden">
              <GlobalSearch compact />
            </div>
            <NotificationBell initialCount={unread} />
            <UserMenu
              nombre={ctx.nombre}
              email={ctx.email}
              rolNombre={ctx.rolNombre}
              multiConjunto={membresias > 1}
              esSuperAdmin={ctx.esSuperAdmin}
              textoGrande={ctx.textoGrande}
            />
          </div>
        </header>
        <main id="contenido" className="mx-auto w-full min-w-0 max-w-6xl flex-1 px-4 pb-28 pt-4 lg:px-8 lg:pb-10 lg:pt-6">
          {children}
        </main>
      </div>
      {residencial && ctx.permisos.has("emergencias.panico") && <PanicButton />}
      <BottomNav items={bottom} />
    </div>
  );
}
