"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

/** Filtros de fecha (desde / hasta) sincronizados con la URL. */
export function FechaFiltro({ desdeDefecto }: { desdeDefecto?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const set = (k: string, v: string) => {
    const n = new URLSearchParams(sp.toString());
    if (v) n.set(k, v);
    else n.delete(k);
    n.delete("page");
    router.replace(`${pathname}?${n.toString()}`);
  };
  return (
    <>
      <label className="flex h-9 shrink-0 items-center gap-1 rounded-full border bg-background px-3 text-sm">
        Desde
        <input type="date" value={sp.get("desde") ?? desdeDefecto ?? ""} onChange={(e) => set("desde", e.target.value)} className="bg-transparent outline-none" />
      </label>
      <label className="flex h-9 shrink-0 items-center gap-1 rounded-full border bg-background px-3 text-sm">
        Hasta
        <input type="date" value={sp.get("hasta") ?? ""} onChange={(e) => set("hasta", e.target.value)} className="bg-transparent outline-none" />
      </label>
      <input
        placeholder="Unidad"
        defaultValue={sp.get("unidad") ?? ""}
        aria-label="Filtrar por unidad"
        onKeyDown={(e) => {
          if (e.key === "Enter") set("unidad", (e.target as HTMLInputElement).value.trim());
        }}
        onBlur={(e) => set("unidad", e.target.value.trim())}
        className="h-9 w-28 shrink-0 rounded-full border bg-background px-3 text-sm"
      />
    </>
  );
}
