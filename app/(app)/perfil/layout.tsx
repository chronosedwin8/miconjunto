import Link from "next/link";
import { FileWarning } from "lucide-react";
import { requireCtx } from "@/lib/auth/context";
import { conjuntoConfig } from "@/lib/conjunto/config";
import { miUsuario, politicaPendiente } from "@/lib/perfil/service";
import { PageHeader } from "@/components/app/page-header";
import { TabsNav } from "@/components/app/tabs-nav";
import { ActionButton } from "@/components/form/action-form";
import { aceptarPoliticaAction } from "./actions";

export default async function PerfilLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireCtx();
  const u = await miUsuario(ctx);
  const cfg = conjuntoConfig(ctx);
  const pendiente = politicaPendiente(ctx, u);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader titulo="Mi perfil" descripcion={`${u.email} · ${ctx.rolNombre}`} />
      {pendiente && (
        <div role="alert" className="mb-4 flex flex-col gap-3 rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm sm:flex-row sm:items-center">
          <FileWarning className="size-6 shrink-0 text-warning" />
          <div className="flex-1">
            <p className="font-semibold">{u.politicaVersion ? "La política de tratamiento de datos cambió" : "Acepta la política de tratamiento de datos"}</p>
            <p className="text-muted-foreground">
              {u.politicaVersion ? `Aceptaste la versión ${u.politicaVersion}; la vigente es la ${cfg.datos.politicaVersion}. ` : ""}
              <Link href={`/politica-datos?c=${ctx.conjunto.slug}`} target="_blank" className="text-primary underline">
                Léela aquí
              </Link>
              .
            </p>
          </div>
          <ActionButton action={aceptarPoliticaAction} successMessage="Política aceptada" className="w-full sm:w-auto">
            Aceptar versión {cfg.datos.politicaVersion}
          </ActionButton>
        </div>
      )}
      <TabsNav
        exact
        tabs={[
          { href: "/perfil", label: "Mis datos" },
          { href: "/perfil/notificaciones", label: "Notificaciones" },
          { href: "/perfil/seguridad", label: "Seguridad" },
          { href: "/perfil/privacidad", label: "Privacidad" },
        ]}
      />
      {children}
    </div>
  );
}
