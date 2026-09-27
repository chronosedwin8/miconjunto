"use client";

import { useRef, useState } from "react";
import { CloudCheck, Loader2 } from "lucide-react";
import { ActionForm, formToObject, type AnyAction } from "@/components/form/action-form";
import { guardarBorradorAction } from "../actions";

/**
 * Formulario de un paso del panel con borrador en el servidor (BorradorFormulario):
 * mientras la persona escribe se guarda cada ~1 s, y puede continuar desde otro dispositivo.
 */
export function BorradorForm({
  clave,
  action,
  extra,
  redirectTo,
  submitLabel = "Guardar y continuar",
  successMessage = "Guardado",
  children,
}: {
  clave: string;
  action: AnyAction;
  extra?: Record<string, unknown>;
  redirectTo?: string;
  submitLabel?: string;
  successMessage?: string;
  children: React.ReactNode;
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [estado, setEstado] = useState<"idle" | "guardando" | "guardado">("idle");
  const onChange = (e: React.FormEvent<HTMLDivElement>) => {
    const form = (e.target as HTMLInputElement).form;
    if (!form) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setEstado("guardando");
      const datos = formToObject(new FormData(form));
      const r = await guardarBorradorAction({ clave, datos });
      setEstado(r.ok ? "guardado" : "idle");
    }, 1000);
  };
  return (
    <div onChange={onChange}>
      <ActionForm
        action={action}
        extra={extra}
        redirectTo={redirectTo}
        submitLabel={submitLabel}
        successMessage={successMessage}
        submitClassName="w-full sm:w-auto"
        onDone={() => {
          if (timer.current) clearTimeout(timer.current);
        }}
        footer={
          <p className="flex min-h-5 items-center gap-1.5 text-xs text-muted-foreground" aria-live="polite">
            {estado === "guardando" && (
              <>
                <Loader2 className="size-3.5 animate-spin" /> Guardando borrador…
              </>
            )}
            {estado === "guardado" && (
              <>
                <CloudCheck className="size-3.5" /> Borrador guardado. Puedes continuar después, incluso desde otro dispositivo.
              </>
            )}
          </p>
        }
      >
        {children}
      </ActionForm>
    </div>
  );
}
