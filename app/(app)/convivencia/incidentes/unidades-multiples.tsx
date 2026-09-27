"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { SearchSelect, type Option } from "@/components/form/fields";
import { useFieldError } from "@/components/form/action-form";

/** Selección de varias unidades (chips) sobre SearchSelect. Envía `name[]`. */
export function UnidadesMultiples({ name, label, options }: { name: string; label: string; options: Option[] }) {
  const [sel, setSel] = useState<string[]>([]);
  const [clave, setClave] = useState(0);
  const error = useFieldError(name);
  return (
    <div className="space-y-2">
      {sel.map((v) => (
        <input key={v} type="hidden" name={`${name}[]`} value={v} />
      ))}
      <SearchSelect
        key={clave}
        name="_unidad_tmp"
        label={label}
        options={options.filter((o) => !sel.includes(o.value))}
        placeholder="Agregar unidad…"
        onChange={(v) => {
          if (v) setSel((s) => [...s, v]);
          setClave((k) => k + 1);
        }}
      />
      <div className="flex flex-wrap gap-2">
        {sel.map((v) => (
          <span key={v} className="inline-flex h-8 items-center gap-1 rounded-full border bg-muted px-3 text-sm">
            {options.find((o) => o.value === v)?.label}
            <button type="button" aria-label="Quitar" onClick={() => setSel((s) => s.filter((x) => x !== v))} className="p-1">
              <X className="size-3.5" />
            </button>
          </span>
        ))}
      </div>
      {error && <p className="text-xs font-medium text-destructive">{error}</p>}
    </div>
  );
}
