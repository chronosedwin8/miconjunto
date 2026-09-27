"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, FileDown, Loader2, PenLine, Save, Send, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FirmaPad } from "@/components/gobierno/firma-pad";
import { firmarActaAction, generarActaAction, guardarActaAction, publicarActaAction } from "../../actions";

type Props = {
  asambleaId: string;
  texto: string;
  presidente: string;
  secretario: string;
  firmaPresidente: string | null;
  firmaSecretario: string | null;
  finalizada: boolean;
  publicada: boolean;
  codigo: string | null;
};

function Firmante({ rol, nombre: nombreInicial, firma, asambleaId, deshabilitado }: { rol: "PRESIDENTE" | "SECRETARIO"; nombre: string; firma: string | null; asambleaId: string; deshabilitado: boolean }) {
  const [nombre, setNombre] = useState(nombreInicial);
  const [trazo, setTrazo] = useState<string | null>(null);
  const [editar, setEditar] = useState(!firma);
  const [pending, start] = useTransition();
  const router = useRouter();
  const titulo = rol === "PRESIDENTE" ? "Presidente de la asamblea" : "Secretario de la asamblea";
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="font-semibold">{titulo}</p>
      <div className="mt-2 space-y-1.5">
        <Label htmlFor={`n-${rol}`}>Nombre</Label>
        <Input id={`n-${rol}`} value={nombre} onChange={(e) => setNombre(e.target.value)} />
      </div>
      {firma && !editar ? (
        <div className="mt-3">
          <img src={firma} alt={`Firma del ${titulo.toLowerCase()}`} className="h-24 w-full rounded-lg border bg-white object-contain" />
          <p className="mt-2 flex items-center gap-1 text-sm text-success">
            <CheckCircle2 className="size-4" /> Firmada
          </p>
          <Button type="button" variant="ghost" size="sm" onClick={() => setEditar(true)} disabled={deshabilitado}>
            Volver a firmar
          </Button>
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          <FirmaPad onChange={setTrazo} alto={150} />
          <Button
            type="button"
            className="w-full"
            disabled={!trazo || nombre.trim().length < 3 || pending || deshabilitado}
            onClick={() =>
              start(async () => {
                const r = await firmarActaAction({ asambleaId, rol, nombre, firma: trazo! });
                if (r.ok) {
                  toast.success("Firma guardada");
                  setEditar(false);
                  router.refresh();
                } else toast.error(r.error);
              })
            }
          >
            {pending ? <Loader2 className="animate-spin" /> : <PenLine />} Firmar
          </Button>
        </div>
      )}
    </div>
  );
}

export function ActaEditor(p: Props) {
  const [texto, setTexto] = useState(p.texto);
  const [presidente, setPresidente] = useState(p.presidente);
  const [secretario, setSecretario] = useState(p.secretario);
  const [sucio, setSucio] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();

  const guardar = () =>
    start(async () => {
      const r = await guardarActaAction({ asambleaId: p.asambleaId, actaTexto: texto, presidenteNombre: presidente, secretarioNombre: secretario });
      if (r.ok) {
        toast.success("Acta guardada");
        setSucio(false);
        router.refresh();
      } else toast.error(r.error);
    });

  return (
    <div className="space-y-6">
      <div className="rounded-xl border bg-card p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="font-semibold">Texto del acta</p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => {
                if (texto.trim() && !window.confirm("Se reemplazará el texto actual por la plantilla con los resultados actualizados. ¿Continuar?")) return;
                start(async () => {
                  const r = await generarActaAction({ id: p.asambleaId });
                  if (r.ok) {
                    setTexto(r.data.texto);
                    setSucio(true);
                    toast.success("Plantilla generada con los resultados de las votaciones");
                  } else toast.error(r.error);
                });
              }}
            >
              <Wand2 /> Insertar resultados (plantilla)
            </Button>
            <Button type="button" variant="outline" size="sm" render={<a href={`/api/v1/asambleas/${p.asambleaId}/acta`} target="_blank" rel="noopener" />}>
              <FileDown /> Vista previa PDF
            </Button>
          </div>
        </div>
        <div className="mb-3 grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="pres">Presidente de la asamblea</Label>
            <Input id="pres" value={presidente} onChange={(e) => (setPresidente(e.target.value), setSucio(true))} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="secr">Secretario de la asamblea</Label>
            <Input id="secr" value={secretario} onChange={(e) => (setSecretario(e.target.value), setSucio(true))} />
          </div>
        </div>
        <Label htmlFor="acta" className="sr-only">
          Texto del acta
        </Label>
        <Textarea id="acta" value={texto} onChange={(e) => (setTexto(e.target.value), setSucio(true))} className="min-h-[28rem] font-mono text-sm leading-relaxed" />
        <p className="mt-1 text-xs text-muted-foreground">Formato: «# » título, «## » sección, «### » subtítulo, «- » viñeta. Si cambias el texto después de firmar, las firmas se borran.</p>
        <Button type="button" className="mt-3" onClick={guardar} disabled={pending || !sucio}>
          {pending ? <Loader2 className="animate-spin" /> : <Save />} Guardar acta
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Firmante rol="PRESIDENTE" nombre={presidente} firma={p.firmaPresidente} asambleaId={p.asambleaId} deshabilitado={sucio} />
        <Firmante rol="SECRETARIO" nombre={secretario} firma={p.firmaSecretario} asambleaId={p.asambleaId} deshabilitado={sucio} />
      </div>
      {sucio && <p className="text-sm text-warning">Guarda el acta antes de firmar.</p>}

      <div className="rounded-xl border bg-card p-4">
        <p className="font-semibold">Publicación</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Genera el PDF con QR de verificación y lo publica en Documentos (categoría Actas) para todos los copropietarios.
          {p.codigo ? ` Código: ${p.codigo}.` : ""}
        </p>
        <Button
          type="button"
          className="mt-3"
          disabled={pending || sucio || !p.finalizada || !p.firmaPresidente || !p.firmaSecretario}
          onClick={() => {
            if (!window.confirm(p.publicada ? "¿Publicar una nueva versión del acta?" : "¿Publicar el acta firmada en Documentos?")) return;
            start(async () => {
              const r = await publicarActaAction({ id: p.asambleaId });
              if (r.ok) {
                toast.success(`Acta publicada (${r.data.actaCodigo})`);
                router.refresh();
              } else toast.error(r.error);
            });
          }}
        >
          <Send /> {p.publicada ? "Publicar nueva versión" : "Publicar acta"}
        </Button>
        {!p.finalizada && <p className="mt-2 text-xs text-muted-foreground">Disponible cuando la asamblea finalice.</p>}
      </div>
    </div>
  );
}
