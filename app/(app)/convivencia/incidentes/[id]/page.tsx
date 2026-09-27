import Link from "next/link";
import { requirePage } from "@/lib/auth/guard";
import { can } from "@/lib/permisos";
import { fecha, fechaHora, isoDate } from "@/lib/format";
import { label } from "@/lib/labels";
import { esGestor, obtenerIncidente } from "@/lib/convivencia/service";
import { Section } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { FormDialog } from "@/components/app/form-dialog";
import { SelectField, TextAreaField, TextField } from "@/components/form/fields";
import { estadoIncidenteAction, sesionAction } from "../../actions";

export const metadata = { title: "Incidente de convivencia" };

export default async function IncidentePage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePage(["convivencia.ver", "convivencia.ver_todos"]);
  const { id } = await params;
  const i = await obtenerIncidente(ctx, id);
  const gestor = esGestor(ctx);
  const gestiona = can(ctx, "convivencia.incidentes");
  const abierto = i.estado !== "CERRADO";
  return (
    <>
      <Link href={gestor ? "/convivencia/incidentes" : "/convivencia"} className="text-sm text-muted-foreground">
        ← {gestor ? "Incidentes" : "Mis llamados y multas"}
      </Link>
      <div className="mt-2 mb-4 flex flex-wrap items-center gap-2">
        <h2 className="text-xl font-bold">{i.titulo}</h2>
        <StatusBadge value={i.estado} />
      </div>
      <p className="mb-4 text-sm text-muted-foreground">
        Unidades: {i.unidades.map((u) => u.codigo).join(", ")} · Registrado el {fecha(i.fecha)}
        {i.mediador ? ` · Mediador: ${i.mediador.nombre}` : ""}
      </p>
      {gestor && (
        <Section titulo="Descripción">
          <p className="whitespace-pre-line rounded-xl border bg-card p-4 text-sm">{i.descripcion}</p>
        </Section>
      )}

      {gestiona && abierto && (
        <div className="mb-6 flex flex-wrap gap-2">
          <FormDialog titulo="Registrar sesión de mediación" action={sesionAction} extra={{ id: i.id }} triggerLabel="Sesión de mediación" successMessage="Sesión registrada" wide>
            <TextField name="fecha" label="Fecha" type="date" defaultValue={isoDate(new Date())} required />
            <TextField name="asistentes" label="Asistentes" placeholder="Nombres y unidades" required />
            <TextAreaField name="notas" label="Desarrollo de la sesión" required />
            <TextAreaField name="compromisos" label="Compromisos" />
          </FormDialog>
          <FormDialog titulo="Actualizar estado" action={estadoIncidenteAction} extra={{ id: i.id }} triggerLabel="Acuerdos y estado" triggerVariant="outline" successMessage="Incidente actualizado">
            <SelectField
              name="estado"
              label="Estado"
              options={["EN_MEDIACION", "ACUERDO", "CERRADO", "ESCALADO"].map((e) => ({ value: e, label: label(e) }))}
              defaultValue={i.estado === "ABIERTO" ? "EN_MEDIACION" : i.estado}
              placeholder={false}
            />
            <TextAreaField name="acuerdos" label="Acuerdos alcanzados" defaultValue={i.acuerdos ?? ""} />
          </FormDialog>
        </div>
      )}

      <Section titulo="Acuerdos">
        <p className="whitespace-pre-line rounded-xl border bg-card p-4 text-sm">{i.acuerdos || "Aún no hay acuerdos registrados."}</p>
      </Section>

      <Section titulo={`Sesiones de mediación (${i.sesionesLista.length})`}>
        {i.sesionesLista.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin sesiones registradas.</p>
        ) : (
          <ol className="space-y-3">
            {i.sesionesLista.map((s) => (
              <li key={s.id} className="rounded-xl border bg-card p-4 text-sm">
                <p className="text-xs text-muted-foreground">
                  {fechaHora(s.fecha)} · {s.registradaPor}
                </p>
                <p className="mt-1">
                  <span className="font-medium">Asistentes:</span> {s.asistentes}
                </p>
                {gestor && <p className="mt-1 whitespace-pre-line">{s.notas}</p>}
                {s.compromisos && (
                  <p className="mt-1 whitespace-pre-line">
                    <span className="font-medium">Compromisos:</span> {s.compromisos}
                  </p>
                )}
              </li>
            ))}
          </ol>
        )}
      </Section>
    </>
  );
}
