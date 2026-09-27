import { z } from "zod";
import { parseLocal } from "@/lib/format";

let configured = false;
/** Mensajes de validación en español. */
export function zodEs() {
  if (configured) return;
  configured = true;
  z.config(z.locales.es());
}
zodEs();

const empty = (v: unknown) => v === undefined || v === null || (typeof v === "string" && v.trim() === "");

/** Parsea valores monetarios escritos en formato colombiano: "1.234.567", "$ 1.234.567,50". */
export function parseMoney(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v !== "string") return NaN;
  let s = v.replace(/[$\s]/g, "");
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  return Number(s);
}

/** Esquemas pensados para datos que llegan de formularios (strings). */
export const zs = {
  text: (min = 1, max = 500) =>
    z.preprocess((v) => (typeof v === "string" ? v.trim() : v), z.string({ error: "Este campo es obligatorio" }).min(min, min === 1 ? "Este campo es obligatorio" : undefined).max(max)),
  optText: (max = 5000) =>
    z.preprocess((v) => (empty(v) ? null : typeof v === "string" ? v.trim() : v), z.string().max(max).nullable()).optional(),
  email: () => z.preprocess((v) => (typeof v === "string" ? v.trim().toLowerCase() : v), z.email("Correo electrónico no válido")),
  optEmail: () =>
    z.preprocess((v) => (empty(v) ? null : typeof v === "string" ? v.trim().toLowerCase() : v), z.email("Correo electrónico no válido").nullable()).optional(),
  int: (min?: number, max?: number) => {
    let s = z.number({ error: "Debe ser un número" }).int();
    if (min !== undefined) s = s.min(min);
    if (max !== undefined) s = s.max(max);
    return z.preprocess((v) => (empty(v) ? undefined : Number(v)), s);
  },
  optInt: () => z.preprocess((v) => (empty(v) ? null : Number(v)), z.number().int().nullable()).optional(),
  number: (min?: number) => {
    let s = z.number({ error: "Debe ser un número" });
    if (min !== undefined) s = s.min(min);
    return z.preprocess((v) => (empty(v) ? undefined : Number(String(v).replace(",", "."))), s);
  },
  optNumber: () => z.preprocess((v) => (empty(v) ? null : Number(String(v).replace(",", "."))), z.number().nullable()).optional(),
  money: (min = 0) => z.preprocess((v) => (empty(v) ? undefined : parseMoney(v)), z.number({ error: "Valor no válido" }).min(min)),
  optMoney: () => z.preprocess((v) => (empty(v) ? null : parseMoney(v)), z.number().min(0).nullable()).optional(),
  bool: () => z.preprocess((v) => v === true || v === "true" || v === "on" || v === "1" || v === 1, z.boolean()),
  date: () =>
    z.preprocess((v) => (empty(v) ? undefined : v instanceof Date ? v : parseLocal(String(v))), z.date({ error: "Fecha no válida" })),
  optDate: () =>
    z.preprocess((v) => (empty(v) ? null : v instanceof Date ? v : parseLocal(String(v))), z.date().nullable()).optional(),
  id: () => z.string().min(1, "Selecciona una opción"),
  optId: () => z.preprocess((v) => (empty(v) ? null : v), z.string().nullable()).optional(),
  list: () =>
    z.preprocess(
      (v) => (Array.isArray(v) ? v : empty(v) ? [] : String(v).split(",").map((x) => x.trim()).filter(Boolean)),
      z.array(z.string()),
    ),
  enumOf: <T extends Record<string, string>>(e: T) => z.enum(e as unknown as Record<string, string>) as unknown as z.ZodType<T[keyof T]>,
  optEnumOf: <T extends Record<string, string>>(e: T) =>
    z.preprocess((v) => (empty(v) ? null : v), (z.enum(e as unknown as Record<string, string>) as unknown as z.ZodType<T[keyof T]>).nullable()).optional(),
};
