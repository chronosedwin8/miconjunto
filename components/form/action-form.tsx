"use client";

import { createContext, useContext, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ActionResult<T = unknown> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyAction = (input: any) => Promise<ActionResult<any>>;

const FormErrorsCtx = createContext<Record<string, string>>({});
export const useFieldError = (name: string) => useContext(FormErrorsCtx)[name];

function setPath(obj: Record<string, unknown>, path: string, value: unknown) {
  const parts = path.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    if (typeof cur[p] !== "object" || cur[p] === null) cur[p] = {};
    cur = cur[p] as Record<string, unknown>;
  }
  const last = parts[parts.length - 1];
  if (last in cur) {
    const prev = cur[last];
    cur[last] = Array.isArray(prev) ? [...prev, value] : [prev, value];
  } else cur[last] = value;
}

/** Convierte FormData en objeto. `campo[]` produce arreglos y `a.b` objetos anidados. */
export function formToObject(fd: FormData) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of fd.entries()) {
    if (typeof v !== "string") continue;
    if (k.startsWith("$ACTION")) continue;
    if (k.endsWith("[]")) {
      const key = k.slice(0, -2);
      const cur = (out[key] as unknown[]) ?? [];
      cur.push(v);
      out[key] = cur;
    } else setPath(out, k, v);
  }
  return out;
}

export function ActionForm({
  action,
  children,
  submitLabel = "Guardar",
  successMessage,
  redirectTo,
  refresh = true,
  resetOnSuccess = false,
  extra,
  className,
  submitClassName,
  draftKey,
  hideSubmit,
  confirm,
  onDone,
  footer,
}: {
  action: AnyAction;
  children: React.ReactNode;
  submitLabel?: string;
  successMessage?: string;
  /** Ruta a la que redirigir. `{id}` se reemplaza con `data.id`. */
  redirectTo?: string;
  refresh?: boolean;
  resetOnSuccess?: boolean;
  /** Valores fijos que se envían junto al formulario. */
  extra?: Record<string, unknown>;
  className?: string;
  submitClassName?: string;
  /** Guarda borrador en el dispositivo mientras se escribe. */
  draftKey?: string;
  hideSubmit?: boolean;
  /** Pide confirmación antes de enviar (acciones de dinero o destructivas). */
  confirm?: string;
  onDone?: (data: unknown) => void;
  footer?: React.ReactNode;
}) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const ref = useRef<HTMLFormElement>(null);

  // Restaurar borrador
  useEffect(() => {
    if (!draftKey || !ref.current) return;
    try {
      const raw = localStorage.getItem(`borrador:${draftKey}`);
      if (!raw) return;
      const data = JSON.parse(raw) as Record<string, string>;
      for (const [k, v] of Object.entries(data)) {
        const el = ref.current.elements.namedItem(k) as HTMLInputElement | null;
        if (el && "value" in el && !el.value) el.value = v;
      }
      toast.info("Recuperamos el borrador que tenías sin guardar.");
    } catch {
      /* ignorar */
    }
  }, [draftKey]);

  const saveDraft = () => {
    if (!draftKey || !ref.current) return;
    const fd = new FormData(ref.current);
    const obj: Record<string, string> = {};
    for (const [k, v] of fd.entries()) if (typeof v === "string" && !k.endsWith("[]")) obj[k] = v;
    try {
      localStorage.setItem(`borrador:${draftKey}`, JSON.stringify(obj));
    } catch {
      /* ignorar */
    }
  };

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (confirm && !window.confirm(confirm)) return;
    const data = { ...formToObject(new FormData(e.currentTarget)), ...extra };
    setFormError(null);
    startTransition(async () => {
      const r = await action(data);
      if (r.ok) {
        setErrors({});
        if (draftKey) localStorage.removeItem(`borrador:${draftKey}`);
        if (successMessage || r.message) toast.success(r.message ?? successMessage);
        if (resetOnSuccess) ref.current?.reset();
        onDone?.(r.data);
        if (redirectTo) {
          const id = (r.data as { id?: string } | null)?.id ?? "";
          router.push(redirectTo.replace("{id}", id));
        } else if (refresh) router.refresh();
      } else {
        setErrors(r.fieldErrors ?? {});
        setFormError(r.error);
        toast.error(r.error);
      }
    });
  };

  return (
    <FormErrorsCtx.Provider value={errors}>
      <form ref={ref} onSubmit={onSubmit} onChange={draftKey ? saveDraft : undefined} className={cn("space-y-4", className)} noValidate>
        {children}
        {formError && (
          <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
            {formError}
          </p>
        )}
        {footer}
        {!hideSubmit && (
          <Button type="submit" disabled={pending} className={cn("w-full sm:w-auto", submitClassName)}>
            {pending && <Loader2 className="animate-spin" />} {submitLabel}
          </Button>
        )}
      </form>
    </FormErrorsCtx.Provider>
  );
}

/** Ejecuta una acción desde un botón (con confirmación opcional). */
export function ActionButton({
  action,
  input,
  children,
  confirm,
  successMessage,
  redirectTo,
  variant,
  size,
  className,
  disabled,
  onDone,
}: {
  action: AnyAction;
  input?: unknown;
  children: React.ReactNode;
  confirm?: string;
  successMessage?: string;
  redirectTo?: string;
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
  className?: string;
  disabled?: boolean;
  onDone?: (data: unknown) => void;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={className}
      disabled={pending || disabled}
      onClick={() => {
        if (confirm && !window.confirm(confirm)) return;
        startTransition(async () => {
          const r = await action(input ?? {});
          if (r.ok) {
            if (successMessage || r.message) toast.success(r.message ?? successMessage);
            onDone?.(r.data);
            if (redirectTo) router.push(redirectTo.replace("{id}", (r.data as { id?: string })?.id ?? ""));
            else router.refresh();
          } else toast.error(r.error);
        });
      }}
    >
      {pending && <Loader2 className="animate-spin" />}
      {children}
    </Button>
  );
}
