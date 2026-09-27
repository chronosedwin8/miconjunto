import { requirePage } from "@/lib/auth/guard";
import { CAMPOS_INTEGRACION, estadoIntegraciones } from "@/lib/integraciones/service";
import { ActionForm } from "@/components/form/action-form";
import { CheckboxField, FormGrid, TextField } from "@/components/form/fields";
import { Badge } from "@/components/ui/badge";
import { fechaHora } from "@/lib/format";
import { guardarIntegracionAction } from "../actions";

export const metadata = { title: "Integraciones" };

const TITULOS: Record<string, { titulo: string; desc: string }> = {
  WOMPI: { titulo: "Wompi", desc: "Pasarela principal: PSE, tarjetas, Nequi y botón Bancolombia. URL de eventos: /api/webhooks/wompi" },
  MERCADOPAGO: { titulo: "Mercado Pago", desc: "PSE y tarjetas. URL de notificaciones: /api/webhooks/mercadopago" },
  FACTUS: { titulo: "Factus (facturación electrónica DIAN)", desc: "Solo para alquiler de zonas comunes gravado con IVA." },
  ALANUBE: { titulo: "Alanube (facturación electrónica)", desc: "Proveedor alterno de facturación electrónica." },
  SMTP: { titulo: "Correo saliente (SMTP)", desc: "Servidor propio del conjunto (Gmail, Outlook, SES, Resend…). Si no se configura se usa el global." },
  WHATSAPP: { titulo: "WhatsApp", desc: "Canal opcional de notificaciones salientes." },
};

export default async function IntegracionesPage() {
  const ctx = await requirePage("configuracion.integraciones");
  const estados = await estadoIntegraciones(ctx);
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Las credenciales se guardan cifradas (AES-256) y tienen prioridad sobre las globales del servidor. Los campos secretos se muestran enmascarados.</p>
      {estados.map((e) => (
        <details key={e.tipo} className="rounded-xl border bg-card p-4">
          <summary className="flex cursor-pointer flex-wrap items-center gap-2">
            <span className="font-semibold">{TITULOS[e.tipo].titulo}</span>
            {e.configurada ? <Badge variant={e.activa ? "success" : "secondary"}>{e.activa ? "Activa" : "Inactiva"}</Badge> : e.usaGlobal ? <Badge variant="info">Usa credenciales globales</Badge> : <Badge variant="outline">Sin configurar</Badge>}
          </summary>
          <p className="my-2 text-sm text-muted-foreground">{TITULOS[e.tipo].desc}</p>
          {e.ultimaPrueba && <p className="mb-2 text-xs text-muted-foreground">Última prueba: {fechaHora(e.ultimaPrueba)} — {e.ultimoResultado}</p>}
          <ActionForm action={guardarIntegracionAction} extra={{ tipo: e.tipo }} successMessage="Credenciales guardadas">
            <FormGrid>
              {CAMPOS_INTEGRACION[e.tipo].map((c) => (
                <TextField key={c.key} name={`datos.${c.key}`} label={c.label} defaultValue={e.valores[c.key] ?? ""} placeholder={c.placeholder} type={c.secreto ? "password" : "text"} autoComplete="off" />
              ))}
            </FormGrid>
            <CheckboxField name="activo" label="Integración activa" defaultChecked={e.activa || !e.configurada} />
          </ActionForm>
        </details>
      ))}
    </div>
  );
}
