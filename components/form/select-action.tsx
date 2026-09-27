"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { AnyAction } from "./action-form";

/** Select que ejecuta una acción al cambiar (p. ej. cambiar rol o estado en una lista). */
export function SelectAction({
  action,
  input,
  field,
  value,
  options,
  ariaLabel,
  confirm,
  className,
}: {
  action: AnyAction;
  input: Record<string, unknown>;
  field: string;
  value: string;
  options: { value: string; label: string }[];
  ariaLabel: string;
  confirm?: string;
  className?: string;
}) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <select
      aria-label={ariaLabel}
      defaultValue={value}
      disabled={pending}
      className={className ?? "h-9 rounded-lg border bg-background px-2 text-sm"}
      onChange={(e) => {
        const v = e.target.value;
        if (confirm && !window.confirm(confirm)) {
          e.target.value = value;
          return;
        }
        start(async () => {
          const r = await action({ ...input, [field]: v });
          if (r.ok) {
            toast.success("Actualizado");
            router.refresh();
          } else {
            toast.error(r.error);
            e.target.value = value;
          }
        });
      }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
