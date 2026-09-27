"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Loader2, Mail, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginAction, requestMagicLinkAction } from "../actions";

export function LoginForm({ next }: { next?: string }) {
  const [modo, setModo] = useState<"clave" | "enlace">("clave");
  const [state, formAction, pending] = useActionState(loginAction, null);
  const [magic, magicAction, magicPending] = useActionState(requestMagicLinkAction, null);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={modo === "clave"}
          onClick={() => setModo("clave")}
          className={`flex h-10 items-center justify-center gap-2 rounded-lg text-sm font-medium ${modo === "clave" ? "bg-background shadow-sm" : "text-muted-foreground"}`}
        >
          <KeyRound className="size-4" /> Contraseña
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={modo === "enlace"}
          onClick={() => setModo("enlace")}
          className={`flex h-10 items-center justify-center gap-2 rounded-lg text-sm font-medium ${modo === "enlace" ? "bg-background shadow-sm" : "text-muted-foreground"}`}
        >
          <Mail className="size-4" /> Enlace por correo
        </button>
      </div>

      {modo === "clave" ? (
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="next" value={next ?? ""} />
          <div className="space-y-1.5">
            <Label htmlFor="email">Correo electrónico</Label>
            <Input id="email" name="email" type="email" autoComplete="email" inputMode="email" required placeholder="tucorreo@ejemplo.com" />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Contraseña</Label>
              <Link href="/recuperar" className="text-sm text-primary underline-offset-4 hover:underline">
                ¿La olvidaste?
              </Link>
            </div>
            <Input id="password" name="password" type="password" autoComplete="current-password" required />
          </div>
          {state?.needOtp && (
            <div className="space-y-1.5">
              <Label htmlFor="otp">Código de verificación (MFA)</Label>
              <Input id="otp" name="otp" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="123456" autoFocus />
            </div>
          )}
          {state?.error && (
            <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
              {state.error}
            </p>
          )}
          <Button type="submit" size="lg" className="w-full" disabled={pending}>
            {pending && <Loader2 className="animate-spin" />} Entrar
          </Button>
        </form>
      ) : (
        <form action={magicAction} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email-magic">Correo electrónico</Label>
            <Input id="email-magic" name="email" type="email" autoComplete="email" inputMode="email" required />
          </div>
          {magic?.error && <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{magic.error}</p>}
          {magic?.message && <p role="status" className="rounded-lg bg-success/10 p-3 text-sm text-success">{magic.message}</p>}
          <Button type="submit" size="lg" className="w-full" disabled={magicPending}>
            {magicPending && <Loader2 className="animate-spin" />} Recibir enlace de acceso
          </Button>
        </form>
      )}
      <p className="text-center text-sm text-muted-foreground">
        ¿Recibiste una invitación? Abre el enlace del correo para crear tu cuenta.
      </p>
    </div>
  );
}
