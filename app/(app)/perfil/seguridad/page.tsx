import { LogOut, ShieldCheck, Smartphone } from "lucide-react";
import { requireCtx } from "@/lib/auth/context";
import { fechaHora } from "@/lib/format";
import { datosQrMfa, miUsuario } from "@/lib/perfil/service";
import { Section } from "@/components/app/page-header";
import { ActionButton, ActionForm } from "@/components/form/action-form";
import { CheckboxField, TextField } from "@/components/form/fields";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { logoutAllDevicesAction } from "@/app/(auth)/actions";
import { cambiarContrasenaAction, confirmarMfaAction, desactivarMfaAction, iniciarMfaAction } from "../actions";

export const metadata = { title: "Seguridad de la cuenta" };

export default async function SeguridadPage() {
  const ctx = await requireCtx();
  const u = await miUsuario(ctx);
  const qr = u.mfaPendiente ? await datosQrMfa(ctx) : null;
  return (
    <>
      <Section titulo={<span className="inline-flex items-center gap-2">Verificación en dos pasos {u.mfaActivo ? <Badge variant="success">Activa</Badge> : <Badge variant="outline">Inactiva</Badge>}</span>}>
        <div className="space-y-3 rounded-xl border bg-card p-4 text-sm">
          {u.mfaActivo ? (
            <>
              <p className="flex items-start gap-2">
                <ShieldCheck className="mt-0.5 size-5 shrink-0 text-success" /> Al iniciar sesión te pediremos el código de 6 dígitos de tu app autenticadora.
              </p>
              <ActionForm action={desactivarMfaAction} submitLabel="Desactivar verificación" successMessage="Verificación en dos pasos desactivada" confirm="¿Desactivar la verificación en dos pasos? Tu cuenta quedará menos protegida.">
                <TextField name="codigo" label="Código actual de tu app" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required />
              </ActionForm>
            </>
          ) : qr ? (
            <>
              <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
                <li>Abre Google Authenticator, Microsoft Authenticator o similar.</li>
                <li>Escanea este código QR (o escribe la clave manualmente).</li>
                <li>Escribe el código de 6 dígitos que aparece en la app.</li>
              </ol>
              <div className="flex flex-col items-center gap-2 sm:flex-row sm:items-start">
                <img src={qr.qr} alt="Código QR para la app autenticadora" className="size-48 rounded-lg border bg-white p-2" />
                <div className="min-w-0 text-xs">
                  <p className="text-muted-foreground">Clave manual:</p>
                  <code className="block break-all rounded bg-muted p-2 font-mono text-sm">{qr.secret.match(/.{1,4}/g)?.join(" ")}</code>
                </div>
              </div>
              <ActionForm action={confirmarMfaAction} submitLabel="Activar" successMessage="Verificación en dos pasos activada">
                <TextField name="codigo" label="Código de 6 dígitos" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required />
              </ActionForm>
              <ActionButton action={iniciarMfaAction} variant="ghost" size="sm">
                Generar otro código QR
              </ActionButton>
            </>
          ) : (
            <>
              <p className="flex items-start gap-2 text-muted-foreground">
                <Smartphone className="mt-0.5 size-5 shrink-0" /> Protege tu cuenta con un código temporal de tu teléfono, además de la contraseña. Recomendado para administradores y consejo.
              </p>
              <ActionButton action={iniciarMfaAction}>Configurar verificación en dos pasos</ActionButton>
            </>
          )}
        </div>
      </Section>

      <Section titulo="Cambiar contraseña">
        <div className="rounded-xl border bg-card p-4">
          <ActionForm action={cambiarContrasenaAction} submitLabel="Cambiar contraseña" successMessage="Contraseña actualizada" resetOnSuccess>
            {u.tieneContrasena && <TextField name="actual" label="Contraseña actual" type="password" autoComplete="current-password" required />}
            <TextField name="nueva" label="Nueva contraseña" type="password" autoComplete="new-password" hint="Mínimo 8 caracteres con mayúsculas, minúsculas y números." required />
            <TextField name="confirmar" label="Repite la nueva contraseña" type="password" autoComplete="new-password" required />
            <CheckboxField name="cerrarOtras" label="Cerrar sesión en todos los dispositivos" hint="Recomendado si crees que alguien más conoce tu contraseña. Tendrás que volver a entrar." defaultChecked />
          </ActionForm>
        </div>
      </Section>

      <Section titulo="Sesiones">
        <div className="space-y-3 rounded-xl border bg-card p-4 text-sm">
          <p className="text-muted-foreground">Último acceso: {fechaHora(u.ultimoAcceso)}. Si perdiste tu teléfono o entraste desde un computador ajeno, cierra la sesión en todos los dispositivos.</p>
          <form action={logoutAllDevicesAction}>
            <Button type="submit" variant="destructive">
              <LogOut /> Cerrar sesión en todos los dispositivos
            </Button>
          </form>
        </div>
      </Section>
    </>
  );
}
