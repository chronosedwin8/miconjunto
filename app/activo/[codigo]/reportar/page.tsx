import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { getCtx } from "@/lib/auth/context";
import { can } from "@/lib/permisos";
import { activoPublico } from "@/lib/activos/service";
import { ActionForm } from "@/components/form/action-form";
import { ChoiceCards, FileField, TextAreaField } from "@/components/form/fields";
import { Button } from "@/components/ui/button";
import { reportarFallaAction } from "./actions";

export const metadata = { title: "Reportar falla", robots: { index: false } };

/** Formulario de reporte de falla desde el QR (exige sesión: si no hay, va al login y regresa aquí). */
export default async function ReportarFallaPage({ params, searchParams }: { params: Promise<{ codigo: string }>; searchParams: Promise<{ radicado?: string }> }) {
  const { codigo } = await params;
  const { radicado } = await searchParams;
  const a = await activoPublico(codigo);
  if (!a) notFound();
  const ctx = await getCtx();
  if (!ctx) redirect(`/login?next=${encodeURIComponent(`/activo/${codigo}/reportar`)}`);

  if (ctx.conjuntoId !== a.conjuntoId) {
    return (
      <Aviso titulo="Este equipo es de otro conjunto">
        El activo pertenece a {a.conjunto.nombre}. Si también vives o trabajas allí, cambia de conjunto e inténtalo de nuevo.
        <Button variant="outline" className="mt-3 w-full" render={<Link href="/seleccionar-conjunto" />}>
          Cambiar de conjunto
        </Button>
      </Aviso>
    );
  }
  if (!can(ctx, ["tickets.crear", "mantenimiento.gestionar"])) {
    return <Aviso titulo="No puedes reportar fallas">Tu perfil no tiene permiso para crear reportes. Comunícate con la administración.</Aviso>;
  }
  if (radicado) {
    return (
      <div className="rounded-2xl border bg-card p-6 text-center shadow-sm">
        <CheckCircle2 className="mx-auto size-12 text-success" aria-hidden />
        <h1 className="mt-3 text-xl font-bold">¡Gracias! Recibimos tu reporte</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Radicado <b className="text-foreground">{radicado}</b> · {a.nombre}
        </p>
        <p className="mt-3 text-sm">El equipo de mantenimiento ya fue notificado. Puedes seguir el avance en PQRS y daños.</p>
        <div className="mt-5 grid gap-2">
          <Button render={<Link href="/tickets" />}>Ver mis reportes</Button>
          <Button variant="outline" render={<Link href="/inicio" />}>
            Ir al inicio
          </Button>
        </div>
      </div>
    );
  }
  return (
    <div className="rounded-2xl border bg-card p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-primary">Reportar falla</p>
      <h1 className="mt-1 text-xl font-bold">{a.nombre}</h1>
      <p className="mb-4 text-sm text-muted-foreground">{[a.zona?.nombre, a.ubicacion].filter(Boolean).join(" · ") || a.categoria}</p>
      <ActionForm action={reportarFallaAction} extra={{ codigoQr: codigo }} submitLabel="Enviar reporte" submitClassName="w-full h-12" redirectTo={`/activo/${codigo}/reportar?radicado={id}`} refresh={false}>
        <ChoiceCards
          name="prioridad"
          columns={1}
          defaultValue="MEDIA"
          options={[
            { value: "MEDIA", label: "Funciona con fallas", description: "Ruido, lentitud, algo no anda bien" },
            { value: "ALTA", label: "No funciona", description: "El equipo está detenido" },
            { value: "URGENTE", label: "Es un riesgo para las personas", description: "Chispas, humo, atrapamiento, fuga" },
          ]}
        />
        <TextAreaField name="descripcion" label="¿Qué pasó?" placeholder="Describe la falla en pocas palabras" required />
        <FileField name="fotos" label="Fotos (opcional)" multiple folder="tickets" />
      </ActionForm>
    </div>
  );
}

function Aviso({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border bg-card p-5 text-sm shadow-sm">
      <h1 className="mb-2 text-lg font-bold">{titulo}</h1>
      {children}
    </div>
  );
}
