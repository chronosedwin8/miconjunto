import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { requireSuperAdmin } from "@/lib/auth/superadmin";
import { TabsNav } from "@/components/app/tabs-nav";
import { logoutAction } from "@/app/(auth)/actions";

export default async function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const su = await requireSuperAdmin();
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur">
        <ShieldCheck className="size-6 text-primary" />
        <span className="font-bold">Conjunto360 · SuperAdmin</span>
        <span className="ml-auto hidden text-sm text-muted-foreground sm:inline">{su.email}</span>
        <Link href="/seleccionar-conjunto" className="text-sm text-primary">
          Entrar a un conjunto
        </Link>
        <form action={logoutAction}>
          <button className="text-sm text-muted-foreground">Salir</button>
        </form>
      </header>
      <main className="mx-auto max-w-6xl px-4 pb-16 pt-4">
        <TabsNav
          exact
          tabs={[
            { href: "/superadmin", label: "Resumen" },
            { href: "/superadmin/conjuntos", label: "Conjuntos" },
            { href: "/superadmin/conjuntos/nuevo", label: "Nuevo conjunto" },
            { href: "/superadmin/planes", label: "Planes" },
            { href: "/superadmin/cotizaciones", label: "Cotizaciones" },
            { href: "/superadmin/usuarios", label: "Usuarios" },
            { href: "/superadmin/jobs", label: "Jobs e integraciones" },
          ]}
        />
        {children}
      </main>
    </div>
  );
}
