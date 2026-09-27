"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { marcarLeidaAction } from "./actions";

/** Fila de notificación: al tocarla se marca como leída y abre el enlace. */
export function NotificacionItem({ id, titulo, cuerpo, enlace, leida, cuando, icono }: { id: string; titulo: string; cuerpo: string; enlace: string | null; leida: boolean; cuando: string; icono: React.ReactNode }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const abrir = () =>
    start(async () => {
      if (!leida) await marcarLeidaAction({ id });
      if (enlace) router.push(enlace);
      else router.refresh();
    });
  return (
    <button type="button" onClick={abrir} disabled={pending} className={cn("flex w-full items-start gap-3 p-3 text-left hover:bg-muted/60 disabled:opacity-60", !leida && "bg-primary/5")}>
      <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-muted">{icono}</span>
      <span className="min-w-0 flex-1">
        <span className={cn("flex items-center gap-2 text-sm", !leida && "font-semibold")}>
          {!leida && <span className="size-2 shrink-0 rounded-full bg-primary" aria-label="Sin leer" />}
          <span className="truncate">{titulo}</span>
        </span>
        <span className="line-clamp-2 block text-sm text-muted-foreground">{cuerpo}</span>
        <span className="block text-xs text-muted-foreground">{cuando}</span>
      </span>
      {enlace && <ChevronRight className="mt-2 size-4 shrink-0 text-muted-foreground" />}
    </button>
  );
}
