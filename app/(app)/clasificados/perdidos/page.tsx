import { redirect } from "next/navigation";
import { spGet, type SP } from "@/lib/pagination";

/** Ruta antigua: los objetos perdidos ahora son un módulo propio. Conserva el filtro de tipo. */
export default async function PerdidosRedirect({ searchParams }: { searchParams: Promise<SP> }) {
  const tipo = spGet(await searchParams, "tipo");
  redirect(tipo === "PERDIDO" ? "/objetos-perdidos?vista=perdidos" : tipo === "ENCONTRADO" ? "/objetos-perdidos?vista=encontrados" : "/objetos-perdidos");
}
