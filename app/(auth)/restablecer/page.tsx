"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { resetPasswordAction } from "../actions";

function Form() {
  const token = useSearchParams().get("token") ?? "";
  const [state, action, pending] = useActionState(resetPasswordAction, null);
  if (state?.ok)
    return (
      <div className="space-y-4">
        <p className="rounded-lg bg-success/10 p-3 text-sm text-success">{state.message}</p>
        <Button className="w-full" render={<Link href="/login" />}>
          Iniciar sesión
        </Button>
      </div>
    );
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <div className="space-y-1.5">
        <Label htmlFor="password">Nueva contraseña</Label>
        <Input id="password" name="password" type="password" required autoComplete="new-password" />
        <p className="text-xs text-muted-foreground">Mínimo 8 caracteres, con mayúsculas, minúsculas y números.</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="confirm">Confirmar contraseña</Label>
        <Input id="confirm" name="confirm" type="password" required autoComplete="new-password" />
      </div>
      {state?.error && <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{state.error}</p>}
      <Button size="lg" className="w-full" disabled={pending}>
        {pending && <Loader2 className="animate-spin" />} Guardar contraseña
      </Button>
    </form>
  );
}

export default function RestablecerPage() {
  return (
    <>
      <h1 className="mb-6 text-2xl font-bold">Nueva contraseña</h1>
      <Suspense>
        <Form />
      </Suspense>
    </>
  );
}
