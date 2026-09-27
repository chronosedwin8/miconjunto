"use client";

import { useState } from "react";
import { Check, Copy, MessageCircle, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ActionForm, type AnyAction } from "@/components/form/action-form";
import { ChoiceCards, FormGrid, SelectField, TextField, type Option } from "@/components/form/fields";

type Resultado = { link: string; whatsapp: string };

/**
 * Invita a un familiar, arrendatario o empleado a crear su cuenta: envía correo y deja listo
 * el mensaje para compartir por WhatsApp desde el teléfono.
 */
export function InvitarDialog({
  action,
  unidades,
  defaults,
  tipos,
  triggerLabel = "Invitar",
  triggerVariant = "outline",
  triggerSize,
  className,
}: {
  action: AnyAction;
  unidades: Option[];
  defaults?: { email?: string | null; nombre?: string | null; telefono?: string | null; unidadId?: string; personaId?: string; tipoVinculo?: string };
  tipos: Option[];
  triggerLabel?: string;
  triggerVariant?: React.ComponentProps<typeof Button>["variant"];
  triggerSize?: React.ComponentProps<typeof Button>["size"];
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [res, setRes] = useState<Resultado | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [tipo, setTipo] = useState(defaults?.tipoVinculo ?? tipos[0]?.value ?? "FAMILIAR");
  const cerrar = (v: boolean) => {
    setOpen(v);
    if (!v) {
      setRes(null);
      setCopiado(false);
    }
  };
  return (
    <>
      <Button variant={triggerVariant} size={triggerSize} className={className} onClick={() => setOpen(true)}>
        <Send /> {triggerLabel}
      </Button>
      <Dialog open={open} onOpenChange={cerrar}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto max-sm:top-auto max-sm:bottom-0 max-sm:max-w-full max-sm:translate-y-0 max-sm:rounded-b-none sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{res ? "Invitación lista" : "Invitar a crear su cuenta"}</DialogTitle>
            <DialogDescription>
              {res ? "Le enviamos un correo. Compártela también por WhatsApp para que la vea más rápido." : "Recibirá un enlace para crear su cuenta en MiConjunto. Vence en 14 días."}
            </DialogDescription>
          </DialogHeader>
          {res ? (
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
              <Button variant="ghost" className="w-full" onClick={() => cerrar(false)}>
                Listo
              </Button>
            </div>
          ) : (
            <ActionForm
              action={action}
              extra={{ personaId: defaults?.personaId }}
              submitLabel="Enviar invitación"
              successMessage="Invitación enviada"
              submitClassName="w-full"
              onDone={(d) => setRes(d as Resultado)}
            >
              {unidades.length > 1 ? (
                <SelectField name="unidadId" label="Unidad" options={unidades} defaultValue={defaults?.unidadId ?? unidades[0]?.value} placeholder={false} />
              ) : (
                <input type="hidden" name="unidadId" value={defaults?.unidadId ?? unidades[0]?.value ?? ""} />
              )}
              <div>
                <p className="mb-1.5 text-sm font-medium">¿Quién es?</p>
                <ChoiceCards name="tipoVinculo" options={tipos} defaultValue={tipo} onChange={setTipo} />
              </div>
              {(tipo === "FAMILIAR" || tipo === "RESIDENTE") && (
                <div>
                  <p className="mb-1.5 text-sm font-medium">Acceso en la app</p>
                  <ChoiceCards
                    name="acceso"
                    columns={2}
                    defaultValue="CONVIVIENTE"
                    options={[
                      { value: "CONVIVIENTE", label: "Básico", description: "Muro, reservas, visitantes y paquetes" },
                      { value: "RESIDENTE", label: "Completo", description: "Además PQRS, familia y vehículos" },
                    ]}
                  />
                </div>
              )}
              <TextField name="email" label="Correo" type="email" autoComplete="off" defaultValue={defaults?.email ?? ""} required />
              <FormGrid>
                <TextField name="nombre" label="Nombre" defaultValue={defaults?.nombre ?? ""} />
                <TextField name="telefono" label="Celular (WhatsApp)" type="tel" inputMode="tel" defaultValue={defaults?.telefono ?? ""} />
              </FormGrid>
              {tipo === "ARRENDATARIO" && <p className="rounded-lg bg-warning/10 p-3 text-xs">El arrendatario quedará pendiente de aprobación de la administración cuando acepte la invitación.</p>}
            </ActionForm>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
