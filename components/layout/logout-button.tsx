"use client";

import { useFormStatus } from "react-dom";
import { Loader2, LogOut } from "lucide-react";
import { logoutAction } from "@/app/(auth)/actions";
import { cn } from "@/lib/utils";

function Boton({ compacto, className }: { compacto?: boolean; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      title={compacto ? "Cerrar sesión" : undefined}
      aria-label={compacto ? "Cerrar sesión" : undefined}
      className={cn("flex min-h-11 w-full items-center gap-3 rounded-md px-2 text-sm font-medium text-destructive hover:bg-destructive/10 disabled:opacity-70", className)}
    >
      {pending ? <Loader2 className="size-[18px] shrink-0 animate-spin" /> : <LogOut className="size-[18px] shrink-0" />}
      {!compacto && (pending ? "Cerrando sesión…" : "Cerrar sesión")}
    </button>
  );
}

/** Cierra la sesión con un formulario (funciona aunque el JS aún no haya cargado) y muestra el progreso. */
export function LogoutButton({ compacto, className }: { compacto?: boolean; className?: string }) {
  return (
    <form action={logoutAction}>
      <Boton compacto={compacto} className={className} />
    </form>
  );
}
