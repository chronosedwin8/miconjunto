import Link from "next/link";
import { verInvitacion } from "@/lib/usuarios/service";
import { parseConfig } from "@/lib/conjunto/config";
import { InvitacionForm } from "./invitacion-form";

export const metadata = { title: "Invitación" };

export default async function InvitacionPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const data = await verInvitacion(token);
  if (!data || !data.conjunto) {
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-bold">Invitación no válida</h1>
        <p className="text-sm text-muted-foreground">El enlace ya fue usado o venció. Pide a quien te invitó que te envíe uno nuevo.</p>
        <Link href="/login" className="text-sm text-primary">
          Ir a iniciar sesión
        </Link>
      </div>
    );
  }
  const cfg = parseConfig(data.conjunto.config);
  return (
    <>
      <h1 className="mb-1 text-2xl font-bold">Bienvenido a {data.conjunto.nombre}</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Te invitaron como <b>{data.rol?.nombre.toLowerCase()}</b>
        {data.unidad ? (
          <>
            {" "}
            de la unidad <b>{data.unidad.codigo}</b>
          </>
        ) : null}
        . {data.usuarioExiste ? "Ya tienes cuenta en Conjunto360: confirma para agregar este conjunto." : "Crea tu cuenta en un minuto."}
      </p>
      <InvitacionForm
        token={token}
        email={data.inv.email}
        nombre={data.inv.nombre ?? ""}
        usuarioExiste={data.usuarioExiste}
        conUnidad={!!data.unidad}
        politica={{ responsable: cfg.datos.responsable, finalidad: cfg.datos.finalidad, version: cfg.datos.politicaVersion }}
      />
    </>
  );
}
