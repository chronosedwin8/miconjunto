import { requirePage } from "@/lib/auth/guard";
import { EVENTOS_WEBHOOK } from "@/lib/events/subscribers";
import { ALL_PERMS } from "@/lib/permisos";
import { fechaHora } from "@/lib/format";
import { decrypt } from "@/lib/crypto";
import { Section } from "@/components/app/page-header";
import { FormDialog } from "@/components/app/form-dialog";
import { ActionButton } from "@/components/form/action-form";
import { TextField } from "@/components/form/fields";
import { StatusBadge } from "@/components/app/status-badge";
import { TokenCreado } from "./token-creado";
import { crearWebhookAction, eliminarWebhookAction, revocarTokenApiAction } from "../actions";

export const metadata = { title: "API y webhooks" };

export default async function ApiPage() {
  const ctx = await requirePage("configuracion.api");
  const [tokens, webhooks] = await Promise.all([
    ctx.db.tokenApi.findMany({ orderBy: { createdAt: "desc" } }),
    ctx.db.webhookSaliente.findMany({ orderBy: { createdAt: "desc" }, include: { entregas: { orderBy: { createdAt: "desc" }, take: 5 } } }),
  ]);
  const lecturas = ALL_PERMS.filter((p) => p.endsWith(".ver") || p.endsWith(".ver_todos"));
  return (
    <>
      <p className="mb-4 text-sm text-muted-foreground">
        API REST en <code>/api/v1</code> (documentación OpenAPI en <a className="text-primary" href="/api/docs" target="_blank">/api/docs</a>). Autentica con <code>Authorization: Bearer &lt;token&gt;</code>.
      </p>
      <Section titulo="Tokens de API" acciones={<TokenCreado permisos={lecturas} />}>
        <ul className="divide-y rounded-xl border bg-card text-sm">
          {tokens.length === 0 && <li className="p-4 text-muted-foreground">Sin tokens.</li>}
          {tokens.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
              <div>
                <p className="font-medium">
                  {t.nombre} <code className="text-xs text-muted-foreground">{t.prefijo}…</code>
                </p>
                <p className="text-xs text-muted-foreground">
                  {t.permisos.length} permisos · último uso {fechaHora(t.ultimoUso)}
                </p>
              </div>
              {t.revocado ? (
                <StatusBadge value="REVOCADA" text="Revocado" />
              ) : (
                <ActionButton action={revocarTokenApiAction} input={{ id: t.id }} size="sm" variant="outline" confirm="¿Revocar este token?">
                  Revocar
                </ActionButton>
              )}
            </li>
          ))}
        </ul>
      </Section>
      <Section
        titulo="Webhooks salientes"
        acciones={
          <FormDialog titulo="Nuevo webhook" descripcion="Enviamos un POST JSON firmado (X-MiConjunto-Signature: HMAC-SHA256)." action={crearWebhookAction} triggerLabel="Agregar" triggerSize="sm" successMessage="Webhook creado">
            <TextField name="url" label="URL de destino" type="url" placeholder="https://…" required />
            <fieldset className="space-y-1">
              <legend className="text-sm font-medium">Eventos</legend>
              {EVENTOS_WEBHOOK.map((e) => (
                <label key={e} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="eventos[]" value={e} className="size-4" /> {e}
                </label>
              ))}
            </fieldset>
          </FormDialog>
        }
      >
        <ul className="divide-y rounded-xl border bg-card text-sm">
          {webhooks.length === 0 && <li className="p-4 text-muted-foreground">Sin webhooks.</li>}
          {webhooks.map((w) => (
            <li key={w.id} className="space-y-1 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="break-all font-medium">{w.url}</p>
                <ActionButton action={eliminarWebhookAction} input={{ id: w.id }} size="sm" variant="ghost" confirm="¿Eliminar webhook?">
                  Eliminar
                </ActionButton>
              </div>
              <p className="text-xs text-muted-foreground">{w.eventos.join(", ")}</p>
              <details className="text-xs">
                <summary className="cursor-pointer text-primary">Ver secreto de firma</summary>
                <code className="break-all">{decrypt(w.secreto)}</code>
              </details>
              {w.entregas.map((d) => (
                <p key={d.id} className="text-xs">
                  {fechaHora(d.createdAt)} · {d.evento} · {d.estado} {d.respuesta}
                </p>
              ))}
            </li>
          ))}
        </ul>
      </Section>
    </>
  );
}
