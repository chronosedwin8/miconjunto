"use client";

import { useState, useTransition } from "react";
import { Check, Copy, Loader2, Lock, MessageCircle, RefreshCw, SlidersHorizontal, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ActionForm, useFieldError, type AnyAction } from "@/components/form/action-form";
import { ChoiceCards, FormGrid, TextField } from "@/components/form/fields";
import { CAPACIDADES, CAPACIDAD_KEYS, PRESETS, PRESET_KEYS, presetPara, type CapacidadKey, type PresetKey } from "@/lib/hogar/capacidades";
import { cn } from "@/lib/utils";
import { CapIcon } from "./cap-chips";

const SHEET = "max-h-[92dvh] overflow-y-auto max-sm:top-auto max-sm:bottom-0 max-sm:max-w-full max-sm:translate-y-0 max-sm:rounded-b-none sm:max-w-lg";

export type Otorgante = { id: string; nombre: string; tipo: string; otorgables: CapacidadKey[] };
type Compartible = { link: string; whatsapp: string };

function filtrar(caps: readonly CapacidadKey[], otorgables: readonly CapacidadKey[]) {
  return caps.filter((c) => otorgables.includes(c));
}

/** Lista de capacidades con interruptores y explicación sencilla. Envía `capacidades[]`. */
export function CapacidadesPicker({
  otorgables,
  value,
  onChange,
}: {
  otorgables: CapacidadKey[];
  value: CapacidadKey[];
  onChange: (v: CapacidadKey[]) => void;
}) {
  const error = useFieldError("capacidades");
  const toggle = (k: CapacidadKey, on: boolean) => onChange(CAPACIDAD_KEYS.filter((c) => (c === k ? on : value.includes(c))));
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-medium">¿Qué podrá hacer en la app?</legend>
      <div className="divide-y rounded-xl border">
        {CAPACIDAD_KEYS.map((k) => {
          const permitido = otorgables.includes(k);
          const def = CAPACIDADES[k];
          return (
            <label
              key={k}
              className={cn("flex min-h-14 items-start gap-3 p-3", permitido ? "cursor-pointer has-[:checked]:bg-primary/5" : "cursor-not-allowed opacity-60")}
            >
              <CapIcon cap={k} className="mt-0.5 size-5 shrink-0 text-primary" />
              <span className="min-w-0 flex-1 text-sm">
                <span className="block font-medium">{def.label}</span>
                <span className="block text-xs text-muted-foreground">
                  {permitido
                    ? def.descripcion
                    : k === "cuenta"
                      ? "Solo lo puede dar quien ve la cuenta de la unidad."
                      : "No se puede dar: quien otorga el acceso no lo tiene."}
                </span>
              </span>
              <input
                type="checkbox"
                name="capacidades[]"
                value={k}
                checked={permitido && value.includes(k)}
                disabled={!permitido}
                onChange={(e) => toggle(k, e.target.checked)}
                className="mt-0.5 size-5 shrink-0 accent-[var(--brand)]"
              />
            </label>
          );
        })}
      </div>
      {error && (
        <p className="mt-1 text-xs font-medium text-destructive" role="alert">
          {error}
        </p>
      )}
      <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
        <Lock className="mt-px size-3.5 shrink-0" /> Votar en asambleas, invitar a otras personas y administrar la cartera son solo del titular: nunca se
        comparten.
      </p>
    </fieldset>
  );
}

/** Enlace de invitación listo para WhatsApp o para copiar. */
export function CompartirInvitacion({ res, onListo }: { res: Compartible; onListo: () => void }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <div className="space-y-3">
      <Button className="w-full bg-[#25D366] text-white hover:bg-[#1ebe5b]" render={<a href={res.whatsapp} target="_blank" rel="noreferrer" />}>
        <MessageCircle /> Compartir por WhatsApp
      </Button>
      <Button
        variant="outline"
        className="w-full"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(res.link);
            setCopiado(true);
            toast.success("Enlace copiado");
          } catch {
            toast.error("No se pudo copiar el enlace");
          }
        }}
      >
        {copiado ? <Check /> : <Copy />} Copiar enlace
      </Button>
      <Button variant="ghost" className="w-full" onClick={onListo}>
        Listo
      </Button>
    </div>
  );
}

/** Invitar a un miembro del hogar: quién es (preset), sus datos y qué podrá hacer. */
export function InvitarAccesoDialog({
  action,
  unidadId,
  otorgantes,
  porDefecto,
  triggerLabel = "Invitar a alguien",
  className,
  variant = "default",
}: {
  action: AnyAction;
  unidadId: string;
  otorgantes: Otorgante[];
  porDefecto: string | null;
  triggerLabel?: string;
  className?: string;
  variant?: React.ComponentProps<typeof Button>["variant"];
}) {
  const inicial = otorgantes.find((o) => o.id === porDefecto) ?? otorgantes[0];
  const [open, setOpen] = useState(false);
  const [res, setRes] = useState<Compartible | null>(null);
  const [otorganteId, setOtorganteId] = useState(inicial?.id ?? "");
  const otorgante = otorgantes.find((o) => o.id === otorganteId) ?? inicial;
  const [preset, setPreset] = useState<PresetKey>("FAMILIAR_ADULTO");
  const [caps, setCaps] = useState<CapacidadKey[]>(filtrar(PRESETS.FAMILIAR_ADULTO.capacidades, inicial?.otorgables ?? []));
  if (!otorgante) return null;
  const esPropietario = otorgante.tipo === "PROPIETARIO" || otorgante.tipo === "COPROPIETARIO";
  const presets = PRESET_KEYS.filter((k) => k !== "ARRENDATARIO" || esPropietario);

  const aplicar = (p: PresetKey, o: Otorgante = otorgante) => {
    setPreset(p);
    setCaps(filtrar(PRESETS[p].capacidades, o.otorgables));
  };
  const cerrar = (v: boolean) => {
    setOpen(v);
    if (!v) {
      setRes(null);
      const o = inicial ?? otorgante;
      aplicar("FAMILIAR_ADULTO", o);
      setOtorganteId(o.id);
    }
  };

  return (
    <>
      <Button variant={variant} className={className} onClick={() => setOpen(true)}>
        <UserPlus /> {triggerLabel}
      </Button>
      <Dialog open={open} onOpenChange={cerrar}>
        <DialogContent className={SHEET}>
          <DialogHeader>
            <DialogTitle>{res ? "Invitación lista" : "Dar acceso a la app"}</DialogTitle>
            <DialogDescription>
              {res
                ? "Le enviamos un correo. Compártela también por WhatsApp para que la vea más rápido."
                : "Recibirá un enlace para crear su cuenta (vence en 14 días). Solo podrá hacer lo que marques aquí."}
            </DialogDescription>
          </DialogHeader>
          {res ? (
            <CompartirInvitacion res={res} onListo={() => cerrar(false)} />
          ) : (
            <ActionForm
              action={action}
              extra={{ unidadId, tipoVinculo: PRESETS[preset].tipoVinculo, derivadoDeId: otorgante.id }}
              submitLabel="Enviar invitación"
              successMessage="Invitación enviada"
              submitClassName="w-full"
              onDone={(d) => setRes(d as Compartible)}
            >
              {otorgantes.length > 1 && (
                <div className="space-y-1.5">
                  <label htmlFor="otorgante" className="text-sm font-medium">
                    Lo otorga
                  </label>
                  <select
                    id="otorgante"
                    value={otorgante.id}
                    onChange={(e) => {
                      const o = otorgantes.find((x) => x.id === e.target.value) ?? otorgante;
                      setOtorganteId(o.id);
                      aplicar(preset === "ARRENDATARIO" && !(o.tipo === "PROPIETARIO" || o.tipo === "COPROPIETARIO") ? "FAMILIAR_ADULTO" : preset, o);
                    }}
                    className="h-11 w-full rounded-lg border bg-background px-3 text-sm"
                  >
                    {otorgantes.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.nombre}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-muted-foreground">Si este titular sale de la unidad, el acceso termina.</p>
                </div>
              )}
              <div>
                <p className="mb-1.5 text-sm font-medium">¿Quién es?</p>
                <ChoiceCards
                  key={presets.join()}
                  name="preset"
                  defaultValue={preset}
                  onChange={(v) => aplicar(v as PresetKey)}
                  options={presets.map((k) => ({ value: k, label: PRESETS[k].label, description: PRESETS[k].descripcion }))}
                />
              </div>
              <TextField name="nombre" label="Nombre" autoComplete="off" required />
              <FormGrid>
                <TextField name="email" label="Correo" type="email" autoComplete="off" inputMode="email" required />
                <TextField name="telefono" label="Celular (WhatsApp)" type="tel" inputMode="tel" autoComplete="off" />
              </FormGrid>
              <CapacidadesPicker otorgables={otorgante.otorgables} value={caps} onChange={setCaps} />
              {preset === "ARRENDATARIO" && (
                <p className="rounded-lg bg-warning/10 p-3 text-xs">
                  La administración debe aprobar al arrendatario cuando acepte la invitación. Él podrá dar acceso a su propio hogar, nunca más del que tú le
                  diste.
                </p>
              )}
            </ActionForm>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Editar lo que puede hacer un miembro (o ajustar a alguien que hoy entra sin límites). */
export function EditarAccesoDialog({
  action,
  vinculoId,
  nombre,
  tipo,
  menor,
  capacidades,
  otorgables,
  derivado,
}: {
  action: AnyAction;
  vinculoId: string;
  nombre: string;
  tipo: string;
  menor: boolean;
  capacidades: CapacidadKey[];
  otorgables: CapacidadKey[];
  derivado: boolean;
}) {
  const sugerido = presetPara(tipo, menor);
  const inicial = derivado ? filtrar(capacidades, otorgables) : filtrar(PRESETS[sugerido].capacidades, otorgables);
  const [open, setOpen] = useState(false);
  const [caps, setCaps] = useState<CapacidadKey[]>(inicial);
  return (
    <>
      <Button
        variant="outline"
        className="w-full"
        onClick={() => {
          setCaps(inicial);
          setOpen(true);
        }}
      >
        <SlidersHorizontal /> {derivado ? "Permisos" : "Ajustar permisos"}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className={SHEET}>
          <DialogHeader>
            <DialogTitle>Permisos de {nombre.split(" ")[0]}</DialogTitle>
            <DialogDescription>
              {derivado
                ? "Los cambios aplican de inmediato en su teléfono."
                : "Hoy entra con todos los permisos de su rol. Al guardar, solo podrá hacer lo que marques."}
            </DialogDescription>
          </DialogHeader>
          <ActionForm
            action={action}
            extra={{ vinculoId }}
            submitLabel="Guardar permisos"
            successMessage="Permisos actualizados"
            submitClassName="w-full"
            onDone={() => setOpen(false)}
          >
            <div className="flex flex-wrap gap-2" role="group" aria-label="Sugerencias">
              {PRESET_KEYS.filter((k) => k !== "ARRENDATARIO" || tipo === "ARRENDATARIO").map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setCaps(filtrar(PRESETS[k].capacidades, otorgables))}
                  className={cn("h-11 rounded-full border px-3 text-xs font-medium hover:bg-muted", k === sugerido && "border-primary/40")}
                >
                  {PRESETS[k].label}
                </button>
              ))}
            </div>
            <CapacidadesPicker otorgables={otorgables} value={caps} onChange={setCaps} />
          </ActionForm>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Reenvía la invitación (enlace nuevo) y muestra cómo compartirla. */
export function ReenviarInvitacionButton({ action, invitacionId }: { action: AnyAction; invitacionId: string }) {
  const [pending, start] = useTransition();
  const [res, setRes] = useState<Compartible | null>(null);
  return (
    <>
      <Button
        variant="outline"
        className="w-full"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await action({ invitacionId });
            if (r.ok) setRes(r.data as Compartible);
            else toast.error(r.error);
          })
        }
      >
        {pending ? <Loader2 className="animate-spin" /> : <RefreshCw />} Reenviar
      </Button>
      <Dialog open={!!res} onOpenChange={(v) => !v && setRes(null)}>
        <DialogContent className={SHEET}>
          <DialogHeader>
            <DialogTitle>Invitación reenviada</DialogTitle>
            <DialogDescription>Generamos un enlace nuevo (el anterior ya no sirve) y lo enviamos por correo.</DialogDescription>
          </DialogHeader>
          {res && <CompartirInvitacion res={res} onListo={() => setRes(null)} />}
        </DialogContent>
      </Dialog>
    </>
  );
}
