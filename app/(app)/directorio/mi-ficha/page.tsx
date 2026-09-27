import { ShieldCheck } from "lucide-react";
import { requirePage } from "@/lib/auth/guard";
import { CAMPOS_DIRECTORIO, fichaPublica, miPersona } from "@/lib/directorio/service";
import { Section } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { ActionForm } from "@/components/form/action-form";
import { CheckboxField, TextAreaField, TextField } from "@/components/form/fields";
import { guardarMiFichaAction } from "../actions";

export const metadata = { title: "Mi ficha en el directorio" };

export default async function MiFichaPage() {
  const ctx = await requirePage(["directorio.ver", "directorio.proveedores"]);
  const p = await miPersona(ctx);
  if (!p) return <EmptyState titulo="Tu cuenta no está vinculada" descripcion="Pide a la administración que te vincule a tu unidad para crear tu ficha." />;
  const unidades = await ctx.db.vinculoUnidad.findMany({ where: { personaId: p.id, estado: "ACTIVO" }, select: { unidad: { select: { codigo: true } } } });
  const vista = fichaPublica(p, unidades.map((u) => u.unidad.codigo));
  return (
    <Section>
      <div className="max-w-xl space-y-4">
        <p className="flex items-start gap-2 rounded-xl bg-muted/60 p-3 text-sm">
          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" />
          Tus datos solo se muestran a los vecinos del conjunto si activas tu ficha, y únicamente los que marques. Puedes desactivarla cuando quieras (Ley 1581 de 2012).
        </p>
        <ActionForm action={guardarMiFichaAction} successMessage="Tu ficha fue actualizada" submitClassName="w-full">
          <CheckboxField name="optIn" label="Aparecer en el directorio de vecinos" defaultChecked={p.directorioOptIn} />
          <fieldset className="space-y-1.5">
            <legend className="text-sm font-medium">¿Qué quieres compartir?</legend>
            <div className="grid grid-cols-2 gap-1.5">
              {CAMPOS_DIRECTORIO.map((c) => (
                <label key={c.value} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-2.5 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                  <input type="checkbox" name="campos[]" value={c.value} defaultChecked={p.directorioCampos.includes(c.value)} className="size-4 accent-[var(--brand)]" />
                  {c.label}
                </label>
              ))}
            </div>
          </fieldset>
          <TextField name="telefono" label="Teléfono / WhatsApp" inputMode="tel" defaultValue={p.telefono ?? ""} maxLength={20} />
          <TextAreaField name="servicios" label="Servicios u oficio que ofreces (opcional)" maxLength={300} rows={2} defaultValue={p.serviciosOfrecidos ?? ""} placeholder="Ej.: Clases de inglés, repostería por encargo, paseo de perros" />
        </ActionForm>
        {p.directorioOptIn && (
          <div className="rounded-xl border bg-card p-3 text-sm">
            <p className="mb-1 text-xs font-medium text-muted-foreground">Así te ven tus vecinos</p>
            <p className="font-medium">{vista.nombre ?? "Vecino"}</p>
            {vista.unidades.length > 0 && <p className="text-muted-foreground">{vista.unidades.join(", ")}</p>}
            {vista.telefono && <p>Tel.: {vista.telefono}</p>}
            {vista.whatsapp && <p>WhatsApp: {vista.whatsapp}</p>}
            {vista.servicios && <p>Servicios: {vista.servicios}</p>}
          </div>
        )}
      </div>
    </Section>
  );
}
