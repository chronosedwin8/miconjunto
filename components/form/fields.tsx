"use client";

import { useId, useMemo, useRef, useState } from "react";
import { Camera, Check, ChevronDown, FileUp, Loader2, Search, X } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useFieldError } from "./action-form";

type Base = { name: string; label?: React.ReactNode; hint?: React.ReactNode; required?: boolean; className?: string };

export function FieldShell({ id, name, label, hint, required, className, children }: Base & { id: string; children: React.ReactNode }) {
  const error = useFieldError(name);
  return (
    <div className={cn("space-y-1.5", className)}>
      {label && (
        <Label htmlFor={id}>
          {label}
          {required && <span className="text-destructive"> *</span>}
        </Label>
      )}
      {children}
      {error ? (
        <p id={`${id}-err`} className="text-xs font-medium text-destructive" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

export function TextField({
  name,
  label,
  hint,
  required,
  className,
  ...props
}: Base & Omit<React.ComponentProps<"input">, "name">) {
  const id = useId();
  const error = useFieldError(name);
  return (
    <FieldShell id={id} name={name} label={label} hint={hint} required={required} className={className}>
      <Input id={id} name={name} aria-invalid={!!error || undefined} aria-describedby={error ? `${id}-err` : undefined} required={required} {...props} />
    </FieldShell>
  );
}

export function TextAreaField({ name, label, hint, required, className, ...props }: Base & Omit<React.ComponentProps<"textarea">, "name">) {
  const id = useId();
  const error = useFieldError(name);
  return (
    <FieldShell id={id} name={name} label={label} hint={hint} required={required} className={className}>
      <Textarea id={id} name={name} aria-invalid={!!error || undefined} required={required} className="min-h-24" {...props} />
    </FieldShell>
  );
}

export type Option = { value: string; label: string; group?: string };

export function SelectField({
  name,
  label,
  hint,
  required,
  className,
  options,
  placeholder = "Selecciona…",
  defaultValue,
  ...props
}: Base & { options: Option[]; placeholder?: string | false; defaultValue?: string | null } & Omit<React.ComponentProps<"select">, "name" | "defaultValue">) {
  const id = useId();
  const error = useFieldError(name);
  const groups = useMemo(() => {
    const g = new Map<string, Option[]>();
    for (const o of options) {
      const k = o.group ?? "";
      g.set(k, [...(g.get(k) ?? []), o]);
    }
    return g;
  }, [options]);
  return (
    <FieldShell id={id} name={name} label={label} hint={hint} required={required} className={className}>
      <div className="relative">
        <select
          id={id}
          name={name}
          defaultValue={defaultValue ?? ""}
          aria-invalid={!!error || undefined}
          className="h-11 w-full appearance-none rounded-lg border border-input bg-background px-3 pr-9 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive md:text-sm"
          {...props}
        >
          {placeholder !== false && <option value="">{placeholder}</option>}
          {[...groups.entries()].map(([g, opts]) =>
            g ? (
              <optgroup key={g} label={g}>
                {opts.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </optgroup>
            ) : (
              opts.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))
            ),
          )}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      </div>
    </FieldShell>
  );
}

function formatThousands(v: string) {
  const digits = v.replace(/[^\d]/g, "");
  if (!digits) return "";
  return Number(digits).toLocaleString("es-CO");
}

export function MoneyField({ name, label, hint, required, className, defaultValue, ...props }: Base & { defaultValue?: number | string | null } & Omit<React.ComponentProps<"input">, "name" | "defaultValue">) {
  const id = useId();
  const error = useFieldError(name);
  const [val, setVal] = useState(defaultValue !== undefined && defaultValue !== null && defaultValue !== "" ? formatThousands(String(Math.round(Number(defaultValue)))) : "");
  return (
    <FieldShell id={id} name={name} label={label} hint={hint} required={required} className={className}>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
        <Input
          id={id}
          name={name}
          inputMode="numeric"
          value={val}
          onChange={(e) => setVal(formatThousands(e.target.value))}
          aria-invalid={!!error || undefined}
          className="pl-7 tabular-nums"
          {...props}
        />
      </div>
    </FieldShell>
  );
}

export function CheckboxField({ name, label, hint, className, defaultChecked, ...props }: Base & Omit<React.ComponentProps<"input">, "name" | "type">) {
  const id = useId();
  const error = useFieldError(name);
  return (
    <div className={cn("space-y-1", className)}>
      <label htmlFor={id} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border p-3 has-[:checked]:border-primary has-[:checked]:bg-primary/5">
        <input type="hidden" name={name} value="false" />
        <input id={id} type="checkbox" name={name} value="true" defaultChecked={defaultChecked} className="mt-0.5 size-5 accent-[var(--brand)]" {...props} />
        <span className="text-sm">
          <span className="font-medium">{label}</span>
          {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
        </span>
      </label>
      {error && <p className="text-xs font-medium text-destructive">{error}</p>}
    </div>
  );
}

/** Opciones grandes y tocables (radio) — ideales para flujos de 3 pasos en el teléfono. */
export function ChoiceCards({
  name,
  options,
  defaultValue,
  columns = 2,
  onChange,
}: {
  name: string;
  options: { value: string; label: string; description?: string; icon?: React.ReactNode }[];
  defaultValue?: string;
  columns?: 1 | 2 | 3;
  onChange?: (v: string) => void;
}) {
  const error = useFieldError(name);
  return (
    <div>
      <div className={cn("grid gap-2", columns === 1 ? "grid-cols-1" : columns === 2 ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-3")} role="radiogroup">
        {options.map((o) => (
          <label
            key={o.value}
            className="flex min-h-16 cursor-pointer flex-col justify-center gap-1 rounded-xl border p-3 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/10 has-[:checked]:ring-2 has-[:checked]:ring-primary/30"
          >
            <input type="radio" name={name} value={o.value} defaultChecked={o.value === defaultValue} className="sr-only" onChange={() => onChange?.(o.value)} />
            <span className="flex items-center gap-2 font-medium">
              {o.icon}
              {o.label}
            </span>
            {o.description && <span className="text-xs text-muted-foreground">{o.description}</span>}
          </label>
        ))}
      </div>
      {error && <p className="mt-1 text-xs font-medium text-destructive">{error}</p>}
    </div>
  );
}

/** Selector con buscador (para unidades, personas, proveedores…). Envía el valor en un input oculto. */
export function SearchSelect({
  name,
  label,
  hint,
  required,
  className,
  options,
  defaultValue,
  placeholder = "Buscar y seleccionar…",
  onChange,
}: Base & { options: Option[]; defaultValue?: string | null; placeholder?: string; onChange?: (v: string) => void }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [value, setValue] = useState(defaultValue ?? "");
  const selected = options.find((o) => o.value === value);
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (s ? options.filter((o) => o.label.toLowerCase().includes(s) || o.group?.toLowerCase().includes(s)) : options).slice(0, 200);
  }, [q, options]);
  return (
    <FieldShell id={id} name={name} label={label} hint={hint} required={required} className={className}>
      <input type="hidden" name={name} value={value} />
      <button
        id={id}
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-11 w-full items-center justify-between rounded-lg border border-input bg-background px-3 text-left text-base md:text-sm"
      >
        <span className={cn("truncate", !selected && "text-muted-foreground")}>{selected ? selected.label : placeholder}</span>
        <Search className="size-4 text-muted-foreground" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="top-4 max-h-[85dvh] translate-y-0 gap-0 p-0 sm:top-[10%] sm:max-w-md" showCloseButton={false}>
          <DialogTitle className="sr-only">{typeof label === "string" ? label : "Seleccionar"}</DialogTitle>
          <div className="flex items-center gap-2 border-b px-3">
            <Search className="size-4 text-muted-foreground" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Escribe para buscar…" className="h-12 flex-1 bg-transparent outline-none" />
            <button type="button" onClick={() => setOpen(false)} aria-label="Cerrar" className="p-2">
              <X className="size-4" />
            </button>
          </div>
          <ul className="max-h-[65dvh] overflow-y-auto p-1">
            {!required && (
              <li>
                <button
                  type="button"
                  className="w-full rounded-md px-3 py-2.5 text-left text-sm text-muted-foreground hover:bg-muted"
                  onClick={() => {
                    setValue("");
                    onChange?.("");
                    setOpen(false);
                  }}
                >
                  Ninguno
                </button>
              </li>
            )}
            {filtered.map((o) => (
              <li key={o.value}>
                <button
                  type="button"
                  onClick={() => {
                    setValue(o.value);
                    onChange?.(o.value);
                    setOpen(false);
                    setQ("");
                  }}
                  className="flex w-full items-center justify-between gap-2 rounded-md px-3 py-2.5 text-left text-sm hover:bg-muted"
                >
                  <span>
                    {o.label}
                    {o.group && <span className="ml-2 text-xs text-muted-foreground">{o.group}</span>}
                  </span>
                  {o.value === value && <Check className="size-4 text-primary" />}
                </button>
              </li>
            ))}
            {filtered.length === 0 && <li className="p-4 text-center text-sm text-muted-foreground">Sin resultados</li>}
          </ul>
        </DialogContent>
      </Dialog>
    </FieldShell>
  );
}

/** Carga de archivos con cámara del teléfono. Sube a /api/upload y guarda las URLs en inputs ocultos. */
export function FileField({
  name,
  label,
  hint,
  className,
  multiple = false,
  accept = "image/*",
  capture = true,
  defaultValue,
  folder = "adjuntos",
  onUploaded,
}: Base & { multiple?: boolean; accept?: string; capture?: boolean; defaultValue?: string[] | string | null; folder?: string; onUploaded?: (urls: string[]) => void }) {
  const id = useId();
  const [urls, setUrls] = useState<string[]>(Array.isArray(defaultValue) ? defaultValue : defaultValue ? [defaultValue] : []);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    const done: string[] = [];
    for (const f of Array.from(files)) {
      const fd = new FormData();
      fd.append("file", f);
      fd.append("folder", folder);
      const r = await fetch("/api/upload", { method: "POST", body: fd });
      const j = (await r.json()) as { url?: string; error?: string };
      if (j.url) done.push(j.url);
      else toast.error(j.error ?? "No se pudo subir el archivo");
    }
    const next = multiple ? [...urls, ...done] : done.slice(0, 1);
    setUrls(next);
    onUploaded?.(next);
    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
  };
  const isImage = (u: string) => /\.(png|jpe?g|webp|gif|heic)$/i.test(u);
  return (
    <FieldShell id={id} name={name} label={label} hint={hint} className={className}>
      {urls.map((u) => (
        <input key={u} type="hidden" name={multiple ? `${name}[]` : name} value={u} />
      ))}
      {!multiple && urls.length === 0 && <input type="hidden" name={name} value="" />}
      <div className="flex flex-wrap gap-2">
        {urls.map((u) => (
          <div key={u} className="relative">
            {isImage(u) ? (
               
              <img src={u} alt="Adjunto" className="size-20 rounded-lg border object-cover" />
            ) : (
              <a href={u} target="_blank" className="grid size-20 place-items-center rounded-lg border bg-muted p-1 text-center text-[10px]">
                {u.split("/").pop()?.slice(17, 40)}
              </a>
            )}
            <button
              type="button"
              aria-label="Quitar archivo"
              onClick={() => {
                const next = urls.filter((x) => x !== u);
                setUrls(next);
                onUploaded?.(next);
              }}
              className="absolute -right-2 -top-2 grid size-6 place-items-center rounded-full bg-foreground text-background"
            >
              <X className="size-3" />
            </button>
          </div>
        ))}
        {(multiple || urls.length === 0) && (
          <label
            htmlFor={id}
            className="flex size-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-xs text-muted-foreground hover:bg-muted"
          >
            {busy ? <Loader2 className="size-5 animate-spin" /> : accept.startsWith("image") ? <Camera className="size-5" /> : <FileUp className="size-5" />}
            {busy ? "Subiendo" : accept.startsWith("image") ? "Foto" : "Archivo"}
          </label>
        )}
      </div>
      <input
        ref={inputRef}
        id={id}
        type="file"
        className="sr-only"
        accept={accept}
        multiple={multiple}
        {...(capture && accept.startsWith("image") ? { capture: "environment" as const } : {})}
        onChange={(e) => upload(e.target.files)}
      />
    </FieldShell>
  );
}

export function FormGrid({ children, cols = 2 }: { children: React.ReactNode; cols?: 1 | 2 | 3 }) {
  return <div className={cn("grid gap-4", cols === 2 && "sm:grid-cols-2", cols === 3 && "sm:grid-cols-2 lg:grid-cols-3")}>{children}</div>;
}
