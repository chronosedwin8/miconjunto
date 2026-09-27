"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useFieldError } from "@/components/form/action-form";

/** Lista de textos editable (opciones de una votación o pregunta). Envía `name[]`. */
export function ListaEditable({ name, label, defaultValue = ["", ""], min = 2, max = 12, placeholder = "Opción" }: { name: string; label: string; defaultValue?: string[]; min?: number; max?: number; placeholder?: string }) {
  const [items, setItems] = useState(defaultValue.length ? defaultValue : ["", ""]);
  const [keys, setKeys] = useState(() => items.map((_, i) => i));
  const error = useFieldError(name);
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {items.map((v, i) => (
        <div key={keys[i]} className="flex gap-2">
          <Input name={`${name}[]`} defaultValue={v} placeholder={`${placeholder} ${i + 1}`} aria-label={`${placeholder} ${i + 1}`} onChange={(e) => setItems((arr) => arr.map((x, j) => (j === i ? e.target.value : x)))} />
          {items.length > min && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Quitar"
              onClick={() => {
                setItems((arr) => arr.filter((_, j) => j !== i));
                setKeys((arr) => arr.filter((_, j) => j !== i));
              }}
            >
              <X />
            </Button>
          )}
        </div>
      ))}
      {items.length < max && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setItems((arr) => [...arr, ""]);
            setKeys((arr) => [...arr, Math.max(0, ...arr) + 1]);
          }}
        >
          <Plus /> Agregar {placeholder.toLowerCase()}
        </Button>
      )}
      {error && <p className="text-xs font-medium text-destructive">{error}</p>}
    </div>
  );
}
