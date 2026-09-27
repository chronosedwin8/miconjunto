"use client";

import { useRef, useState, useTransition } from "react";
import { CalendarClock, Eye, Loader2, Save, Send } from "lucide-react";
import { toast } from "sonner";
import { ActionForm, formToObject, type AnyAction } from "@/components/form/action-form";
import { FileField, TextField } from "@/components/form/fields";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { EditorTexto } from "@/app/(app)/muro/_components/editor-texto";
import { SegmentoBuilder } from "./segmento-builder";

type Opt = { value: string; label: string; group?: string };

export function CampanaForm({
  guardar,
  previa,
  contar,
  opciones,
  segmentos,
  variables,
  inicial,
}: {
  guardar: AnyAction;
  previa: AnyAction;
  contar: AnyAction;
  opciones: { torres: Opt[]; unidades: Opt[]; roles: Opt[] };
  segmentos: Opt[];
  variables: { clave: string; descripcion: string }[];
  inicial?: { id: string; asunto: string; plantilla: string; segmentoId: string | null; definicion: unknown; adjuntos: string[]; programadaPara: string | null };
}) {
  const [html, setHtml] = useState(inicial?.plantilla ?? "<p>Hola {{nombre}},</p><p></p>");
  const [programar, setProgramar] = useState(!!inicial?.programadaPara);
  const accionRef = useRef<HTMLInputElement>(null);
  const formWrap = useRef<HTMLDivElement>(null);
  const [preview, setPreview] = useState<{ html: string; para: string; nombre: string; asunto: string; total: number } | null>(null);
  const [pendingPrev, startPrev] = useTransition();

  const verPrevia = () => {
    const form = formWrap.current?.querySelector("form");
    if (!form) return;
    const data = formToObject(new FormData(form));
    startPrev(async () => {
      const r = await previa({ asunto: data.asunto || "(sin asunto)", plantilla: html || "<p></p>", segmentoId: data.segmentoId, definicion: data.definicion });
      if (r.ok) setPreview(r.data as never);
      else toast.error(r.error);
    });
  };

  return (
    <div ref={formWrap}>
      <ActionForm
        action={guardar}
        extra={{ id: inicial?.id, plantilla: html }}
        hideSubmit
        successMessage="Campaña guardada"
        redirectTo="/comunicaciones/{id}"
        draftKey={inicial ? undefined : "campana-nueva"}
        footer={
          <div className="flex flex-wrap gap-2 border-t pt-3">
            <input ref={accionRef} type="hidden" name="accion" defaultValue="BORRADOR" />
            <Button type="button" variant="outline" onClick={verPrevia} disabled={pendingPrev}>
              {pendingPrev ? <Loader2 className="animate-spin" /> : <Eye />} Vista previa
            </Button>
            <Button type="submit" variant="outline" onClick={() => (accionRef.current!.value = "BORRADOR")}>
              <Save /> Guardar borrador
            </Button>
            {programar ? (
              <Button type="submit" onClick={() => (accionRef.current!.value = "PROGRAMAR")}>
                <CalendarClock /> Programar envío
              </Button>
            ) : (
              <Button
                type="submit"
                onClick={(e) => {
                  if (!window.confirm("¿Enviar la campaña ahora a todos los destinatarios? Esta acción no se puede deshacer.")) {
                    e.preventDefault();
                    return;
                  }
                  accionRef.current!.value = "ENVIAR";
                }}
              >
                <Send /> Enviar ahora
              </Button>
            )}
          </div>
        }
      >
        <TextField name="asunto" label="Asunto" defaultValue={inicial?.asunto} required maxLength={200} placeholder="Ej.: Corte de agua el sábado 5 de octubre" />
        <div className="space-y-1.5">
          <Label>Mensaje</Label>
          <EditorTexto value={html} onChange={setHtml} variables={variables} minHeight={200} ariaLabel="Mensaje del correo" placeholder="Escribe el mensaje. Usa las variables para personalizarlo." />
          <p className="text-xs text-muted-foreground">
            {"{{saldo}}"} solo se muestra a propietarios o personas autorizadas a ver la cuenta; a los demás les aparece “—”.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label>Destinatarios</Label>
          <SegmentoBuilder
            name="definicion"
            segmentoName="segmentoId"
            segmentos={segmentos}
            opciones={opciones}
            contar={contar}
            defaultDef={(inicial?.definicion as never) ?? null}
            defaultSegmentoId={inicial?.segmentoId}
            etiquetaTodos="Todos los residentes"
          />
        </div>
        <FileField name="adjuntos" label="Adjuntos (máx. 5)" multiple accept="application/pdf,image/*,.xlsx,.docx" capture={false} folder="correos" defaultValue={inicial?.adjuntos} />
        <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5">
          <input type="checkbox" checked={programar} onChange={(e) => setProgramar(e.target.checked)} className="size-5 accent-[var(--brand)]" />
          <span className="font-medium">Programar para más tarde</span>
        </label>
        {programar && <TextField name="programadaPara" label="Fecha y hora de envío" type="datetime-local" defaultValue={inicial?.programadaPara ?? ""} required />}
      </ActionForm>

      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Vista previa</DialogTitle>
            <DialogDescription>
              {preview ? (
                <>
                  Así lo verá <b>{preview.nombre}</b> ({preview.para}). Asunto: <b>{preview.asunto}</b>. Total de destinatarios: <b>{preview.total}</b>.
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          {preview && <iframe title="Vista previa del correo" sandbox="" srcDoc={preview.html} className="h-[60dvh] w-full rounded-lg border bg-white" />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
