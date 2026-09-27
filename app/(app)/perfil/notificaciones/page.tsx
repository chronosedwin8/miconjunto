import { requireCtx } from "@/lib/auth/context";
import { conjuntoConfig } from "@/lib/conjunto/config";
import { miUsuario } from "@/lib/perfil/service";
import { Section } from "@/components/app/page-header";
import { ActionForm } from "@/components/form/action-form";
import { CheckboxField } from "@/components/form/fields";
import { guardarPreferenciasAction } from "../actions";
import { PushToggle } from "../push-toggle";

export const metadata = { title: "Preferencias de notificación" };

export default async function PreferenciasPage() {
  const ctx = await requireCtx();
  const u = await miUsuario(ctx);
  const pref = (u.preferenciasNotif ?? {}) as Record<string, boolean>;
  const cfg = conjuntoConfig(ctx).notificaciones;
  const noDisp = (canal: "push" | "email" | "whatsapp") => (cfg[canal] ? undefined : "El conjunto no tiene habilitado este canal por ahora.");
  return (
    <>
      <Section titulo="¿Por dónde quieres recibir los avisos?">
        <ActionForm action={guardarPreferenciasAction} successMessage="Preferencias guardadas">
          <p className="text-sm text-muted-foreground">Las alertas de emergencia y los avisos del centro de notificaciones de la app siempre te llegan.</p>
          <CheckboxField name="push" label="Notificaciones en el teléfono (push)" hint={noDisp("push") ?? "Visitantes en portería, paquetes, pagos y reservas."} defaultChecked={pref.push !== false} />
          <CheckboxField name="email" label="Correo electrónico" hint={noDisp("email") ?? "Recibos, estados de cuenta, convocatorias y respuestas a PQRS."} defaultChecked={pref.email !== false} />
          <CheckboxField name="whatsapp" label="WhatsApp" hint={noDisp("whatsapp") ?? (u.telefono ? `Al número ${u.telefono}.` : "Agrega tu celular en Mis datos.")} defaultChecked={!!pref.whatsapp} />
        </ActionForm>
      </Section>
      <Section titulo="Este dispositivo">
        <div className="space-y-2 rounded-xl border bg-card p-4">
          <p className="text-sm text-muted-foreground">
            {u._count.suscripcionesPush > 0 ? `Tienes notificaciones activas en ${u._count.suscripcionesPush} dispositivo(s).` : "Aún no has activado notificaciones en ningún dispositivo."}
          </p>
          <PushToggle vapidKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY} />
        </div>
      </Section>
    </>
  );
}
