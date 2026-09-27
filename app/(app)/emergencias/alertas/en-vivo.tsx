"use client";

import { useRouter } from "next/navigation";
import { useRealtime } from "@/components/realtime/use-realtime";

/** Refresca la lista de alertas cuando llega una nueva emergencia (canal de portería). */
export function AlertasEnVivo() {
  const router = useRouter();
  useRealtime(["porteria"], (e) => {
    if (e.tipo.startsWith("emergencia.")) router.refresh();
  }, { onPoll: () => router.refresh(), pollMs: 30000 });
  return null;
}
