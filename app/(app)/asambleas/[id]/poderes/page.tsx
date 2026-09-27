import { FileSpreadsheet, Paperclip } from "lucide-react";
import { requirePage } from "@/lib/auth/guard";
import { can } from "@/lib/permisos";
import { listarPoderes, obtenerAsamblea } from "@/lib/asambleas/service";
import { unidadOptions } from "@/lib/conjunto/options";
import { Section } from "@/components/app/page-header";
import { FormDialog } from "@/components/app/form-dialog";
import { StatusBadge } from "@/components/app/status-badge";
import { ActionButton } from "@/components/form/action-form";
import { FileField, SearchSelect, SelectField, TextField } from "@/components/form/fields";
import { Button } from "@/components/ui/button";
import { fechaHora, num } from "@/lib/format";
import { decidirPoderAction, registrarPoderAction } from "../../actions";

export const metadata = { title: "Poderes" };

export default async function PoderesPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePage("asambleas.ver");
  const { id } = await params;
  const a = await obtenerAsamblea(ctx, id);
  const admin = can(ctx, ["asambleas.poderes", "asambleas.gestionar"]);
  const todos = await listarPoderes(ctx, id);
  const poderes = admin ? todos : todos.filter((p) => ctx.unidadesPropias.includes(p.unidadId) || p.apoderadoUsuarioId === ctx.userId);
  const recibe = todos.filter((p) => p.apoderadoUsuarioId === ctx.userId);
  const abierta = ["BORRADOR", "CONVOCADA", "EN_CURSO"].includes(a.estado);
  const opcionesUnidad = admin ? await unidadOptions(ctx) : await unidadOptions(ctx, { soloPropias: true }).then((o) => o.filter((u) => ctx.unidadesPropias.includes(u.value)));
  const puedeOtorgar = abierta && (admin || opcionesUnidad.length > 0);

  const formulario = (
    <FormDialog
      titulo={admin ? "Registrar poder" : "Otorgar poder"}
      descripcion={`Autoriza a otra persona para asistir y votar por tu unidad. Máximo ${a.limitePoderes} poder(es) por apoderado. La administración lo revisa antes de la asamblea.`}
      action={registrarPoderAction}
      extra={{ asambleaId: id }}
      triggerLabel={admin ? "Registrar poder" : "Otorgar poder"}
      submitLabel="Enviar poder"
      successMessage="Poder registrado: queda pendiente de aprobación"
    >
      {opcionesUnidad.length === 1 && !admin ? (
        <>
          <input type="hidden" name="unidadId" value={opcionesUnidad[0].value} />
          <p className="text-sm">
            Unidad: <b>{opcionesUnidad[0].label}</b>
          </p>
        </>
      ) : admin ? (
        <SearchSelect name="unidadId" label="Unidad que otorga el poder" options={opcionesUnidad} required />
      ) : (
        <SelectField name="unidadId" label="Unidad" options={opcionesUnidad} required />
      )}
      <TextField name="apoderadoNombre" label="Nombre completo del apoderado" required />
      <TextField name="apoderadoDocumento" label="Cédula del apoderado" inputMode="numeric" />
      <TextField name="apoderadoEmail" label="Correo del apoderado (si usa la app, podrá votar desde su teléfono)" type="email" />
      <FileField name="documentoUrl" label={admin ? "Poder firmado (opcional)" : "Poder firmado (foto o PDF)"} accept="image/*,application/pdf" capture={false} folder="poderes" hint="Documento escrito y firmado por el propietario." />
    </FormDialog>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Límite: {a.limitePoderes} poder(es) por apoderado. {abierta ? "" : "La asamblea ya no recibe poderes."}
        </p>
        <div className="flex gap-2">
          {admin && (
            <Button variant="outline" render={<a href={`/api/export/poderes-asamblea?asambleaId=${id}`} />}>
              <FileSpreadsheet /> Exportar
            </Button>
          )}
          {puedeOtorgar && formulario}
        </div>
      </div>

      {recibe.length > 0 && !admin && (
        <Section titulo="Poderes que te otorgaron">
          <ul className="space-y-2">
            {recibe.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 rounded-xl border bg-card p-3 text-sm">
                <span>
                  Representas a <b>{p.otorganteNombre}</b> ({p.unidad?.codigo})
                </span>
                <StatusBadge value={p.estado} />
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section titulo={admin ? `Poderes registrados (${poderes.length})` : "Tus poderes"}>
        {poderes.length === 0 ? (
          <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            {admin ? "Aún no hay poderes registrados." : "No has otorgado poderes para esta asamblea. Si no puedes asistir, otorga un poder a una persona de confianza."}
          </p>
        ) : (
          <ul className="space-y-2">
            {poderes.map((p) => (
              <li key={p.id} className="rounded-xl border bg-card p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 text-sm">
                    <p className="font-medium">
                      {p.unidad?.codigo} · {p.otorganteNombre} → {p.apoderadoNombre}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {p.apoderadoDocumento ? `C.C. ${p.apoderadoDocumento} · ` : ""}
                      coef. {num(p.unidad?.coeficiente ?? 0, 4)} % · {fechaHora(p.createdAt)}
                      {p.apoderadoUsuarioId ? " · usa la app" : " · sin cuenta en la app"}
                    </p>
                  </div>
                  <StatusBadge value={p.estado} />
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {p.documentoUrl && (
                    <Button variant="outline" size="sm" render={<a href={p.documentoUrl} target="_blank" rel="noopener" />}>
                      <Paperclip /> Ver documento
                    </Button>
                  )}
                  {admin && p.estado !== "APROBADO" && abierta && (
                    <ActionButton action={decidirPoderAction} input={{ id: p.id, asambleaId: id, estado: "APROBADO" }} size="sm" successMessage="Poder aprobado">
                      Aprobar
                    </ActionButton>
                  )}
                  {admin && p.estado !== "RECHAZADO" && abierta && (
                    <ActionButton action={decidirPoderAction} input={{ id: p.id, asambleaId: id, estado: "RECHAZADO" }} size="sm" variant="destructive" confirm="¿Rechazar este poder?" successMessage="Poder rechazado">
                      Rechazar
                    </ActionButton>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
