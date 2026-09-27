"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestPasswordResetAction } from "../actions";

export default function RecuperarPage() {
  const [state, action, pending] = useActionState(requestPasswordResetAction, null);
  return (
    <>
      <h1 className="mb-1 text-2xl font-bold">Recuperar contraseña</h1>
      <p className="mb-6 text-sm text-muted-foreground">Te enviaremos un enlace para crear una nueva.</p>
      <form action={action} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="email">Correo electrónico</Label>
          <Input id="email" name="email" type="email" required autoComplete="email" />
        </div>
        {state?.message && <p role="status" className="rounded-lg bg-success/10 p-3 text-sm text-success">{state.message}</p>}
        {state?.error && <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{state.error}</p>}
        <Button size="lg" className="w-full" disabled={pending}>
          {pending && <Loader2 className="animate-spin" />} Enviar enlace
        </Button>
        <Link href="/login" className="block text-center text-sm text-primary">
          Volver a iniciar sesión
        </Link>
      </form>
    </>
  );
}
