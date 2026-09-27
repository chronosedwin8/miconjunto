import Link from "next/link";
import { Download, Eye, FileText, PencilLine, Trash2 } from "lucide-react";
import { requireCtx } from "@/lib/auth/context";
import { conjuntoConfig } from "@/lib/conjunto/config";
import { fechaHora } from "@/lib/format";
import { miUsuario } from "@/lib/perfil/service";
import { miPersona } from "@/lib/residentes/service";
import { Section } from "@/components/app/page-header";
import { FormDialog } from "@/components/app/form-dialog";
import { CheckboxField, TextAreaField, TextField } from "@/components/form/fields";
import { Button } from "@/components/ui/button";
import { solicitarSupresionAction } from "../actions";

export const metadata = { title: "Privacidad y datos personales" };

export default async function PrivacidadPage() {
  const ctx = await requireCtx();
  const [u, p] = await Promise.all([miUsuario(ctx), miPersona(ctx)]);
  const cfg = conjuntoConfig(ctx).datos;
  const [vinculos, vehiculos, mascotas] = p
    ? await Promise.all([
        ctx.db.vinculoUnidad.count({ where: { personaId: p.id } }),
        ctx.db.vehiculo.count({ where: { unidadId: { in: ctx.unidadIds } } }),
        ctx.db.mascota.count({ where: { unidadId: { in: ctx.unidadIds } } }),
      ])
    : [0, 0, 0];
  const categorias = [
    ["Identificación", "Nombre, documento, fecha de nacimiento y foto"],
    ["Contacto", "Correo y celular"],
    ["Vivienda", `${vinculos} vínculo(s) con unidades, ${vehiculos} vehículo(s) y ${mascotas} mascota(s) de tus unidades`],
    ["Salud y emergencias", "Movilidad reducida, tipo de sangre, EPS y contacto de emergencia (dato sensible, solo con tu autorización)"],
    ["Uso de la app", "Accesos, notificaciones y preferencias"],
  ];
  return (
    <>
      <Section titulo="Tus derechos (Ley 1581 de 2012)">
        <div className="grid gap-2 sm:grid-cols-2">
          <a href="/perfil/mis-datos" className="flex min-h-16 items-center gap-3 rounded-xl border bg-card p-3 text-sm hover:bg-muted/60" download>
            <Download className="size-5 text-primary" />
            <span>
              <span className="block font-medium">Descargar mis datos</span>
              <span className="block text-xs text-muted-foreground">Archivo JSON con toda tu información</span>
            </span>
          </a>
          <Link href="/perfil" className="flex min-h-16 items-center gap-3 rounded-xl border bg-card p-3 text-sm hover:bg-muted/60">
            <PencilLine className="size-5 text-primary" />
            <span>
              <span className="block font-medium">Actualizar o corregir</span>
              <span className="block text-xs text-muted-foreground">Edita tus datos personales</span>
            </span>
          </Link>
        </div>
      </Section>

      <Section titulo={<span className="inline-flex items-center gap-2"><Eye className="size-4" /> Qué datos tratamos</span>}>
        <dl className="divide-y rounded-xl border bg-card text-sm">
          {categorias.map(([k, v]) => (
            <div key={k} className="p-3">
              <dt className="font-medium">{k}</dt>
              <dd className="text-muted-foreground">{v}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section titulo={<span className="inline-flex items-center gap-2"><FileText className="size-4" /> Política de tratamiento</span>}>
        <div className="space-y-2 rounded-xl border bg-card p-4 text-sm">
          <p>
            <b>Responsable:</b> {cfg.responsable} — {ctx.conjunto.nombre}
            {cfg.emailContacto && ` · ${cfg.emailContacto}`}
          </p>
          <p>
            <b>Finalidad:</b> {cfg.finalidad}
          </p>
          <p>
            <b>Tu aceptación:</b> {u.politicaAceptadaEn ? `versión ${u.politicaVersion} el ${fechaHora(u.politicaAceptadaEn)}` : "aún no la has aceptado"} · vigente: versión {cfg.politicaVersion}
          </p>
          <Link href={`/politica-datos?c=${ctx.conjunto.slug}`} target="_blank" className="text-primary underline">
            Leer la política completa
          </Link>
        </div>
      </Section>

      <Section titulo="Suprimir mis datos">
        <div className="space-y-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
          <p>
            Anonimizamos tu registro en {ctx.conjunto.nombre}: tu nombre se reemplaza por «Titular retirado», el documento por un código irreversible y se borran tus datos de contacto, salud y foto. Los
            vínculos de propiedad se conservan anonimizados porque la Ley 675 de 2001 obliga a llevar el registro de propietarios, y los pagos se conservan por obligación contable.
          </p>
          <FormDialog
            titulo="Suprimir mis datos"
            descripcion="Esta acción no se puede deshacer."
            action={solicitarSupresionAction}
            trigger={
              <Button variant="destructive">
                <Trash2 /> Solicitar supresión
              </Button>
            }
            submitLabel="Suprimir mis datos"
            successMessage="Tus datos fueron anonimizados"
            confirm="¿Seguro? Tus datos personales se anonimizarán de forma irreversible."
          >
            <TextAreaField name="motivo" label="Motivo (opcional)" />
            <CheckboxField name="cerrarCuenta" label="También cerrar mi cuenta en este conjunto" hint="Perderás el acceso a la app. Si tienes saldo pendiente, seguirá a cargo de la unidad." />
            <TextField name="confirmacion" label='Escribe "SUPRIMIR" para confirmar' autoComplete="off" required />
          </FormDialog>
        </div>
      </Section>
    </>
  );
}
