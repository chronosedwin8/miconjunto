"use client";

import { useRouter } from "next/navigation";
import { SearchSelect, type Option } from "@/components/form/fields";

export function UnidadJump({ unidades }: { unidades: Option[] }) {
  const router = useRouter();
  return <SearchSelect name="unidad" label="Unidad" options={unidades} required onChange={(v) => v && router.push(`/informes/unidad/${v}`)} placeholder="Busca la unidad…" />;
}
