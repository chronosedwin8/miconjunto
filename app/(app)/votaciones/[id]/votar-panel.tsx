"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, Lock, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CopiarTexto } from "@/components/gobierno/copiar";
import { cn } from "@/lib/utils";
import { votarAction } from "../actions";

type UnidadVotante = { unidadId: string; codigo: string; coeficiente: number; porPoder: boolean; otorgante?: string | null; yaVoto: boolean; bloqueo?: string | null };

/** Votar en ≤ 3 toques: (1) abrir la votación, (2) elegir opción, (3) confirmar. */
export function VotarPanel({ votacionId, opciones, unidades, secreto }: { votacionId: string; opciones: { id: string; texto: string }[]; unidades: UnidadVotante[]; secreto: boolean }) {
  const pendientes = unidades.filter((u) => !u.yaVoto && !u.bloqueo);
  const [unidadId, setUnidadId] = useState(pendientes[0]?.unidadId ?? "");
  const [opcion, setOpcion] = useState<string | null>(null);
  const [recibo, setRecibo] = useState<{ comprobante: string; unidad: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const bloqueadas = unidades.filter((u) => !u.yaVoto && u.bloqueo);

  if (recibo) {
    return (
      <div className="rounded-xl border border-success/40 bg-success/5 p-4" role="status">
        <p className="flex items-center gap-2 text-lg font-semibold text-success">
          <CheckCircle2 className="size-6" /> ¡Voto registrado por {recibo.unidad}!
        </p>
        <p className="mt-2 text-sm text-muted-foreground">Tu comprobante {secreto ? "(voto secreto: no guardamos quién votó)" : ""}:</p>
        <p className="mt-1 break-all rounded-lg bg-muted p-2 font-mono text-xs" data-testid="comprobante">
          {recibo.comprobante}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <CopiarTexto texto={recibo.comprobante} etiqueta="Copiar comprobante" />
          {pendientes.length > 1 && (
            <Button
              type="button"
              onClick={() => {
                setRecibo(null);
                setOpcion(null);
                setUnidadId(pendientes.find((p) => p.codigo !== recibo.unidad)?.unidadId ?? "");
              }}
            >
              Votar por otra unidad
            </Button>
          )}
        </div>
      </div>
    );
  }

  if (!pendientes.length) {
    return bloqueadas.length ? (
      <div className="rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm">
        <p className="flex items-center gap-2 font-semibold">
          <Lock className="size-4" /> No puedes votar por ahora
        </p>
        <ul className="mt-2 space-y-1">
          {bloqueadas.map((u) => (
            <li key={u.unidadId}>
              <b>{u.codigo}:</b> {u.bloqueo}
            </li>
          ))}
        </ul>
      </div>
    ) : null;
  }

  const actual = pendientes.find((u) => u.unidadId === unidadId);
  return (
    <div className="rounded-xl border-2 border-primary/40 bg-card p-4">
      <p className="text-sm font-semibold">Tu voto</p>
      {pendientes.length > 1 ? (
        <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label="Unidad por la que votas">
          {pendientes.map((u) => (
            <button
              key={u.unidadId}
              type="button"
              role="radio"
              aria-checked={u.unidadId === unidadId}
              onClick={() => setUnidadId(u.unidadId)}
              className={cn("min-h-11 rounded-lg border px-3 text-sm font-medium", u.unidadId === unidadId ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground")}
            >
              {u.codigo}
              {u.porPoder ? " (poder)" : ""}
            </button>
          ))}
        </div>
      ) : (
        <p className="mt-1 text-sm text-muted-foreground">
          Votas por <b className="text-foreground">{actual?.codigo}</b>
          {actual?.porPoder ? ` en representación de ${actual.otorgante ?? "su propietario"}` : ""} · coeficiente {actual?.coeficiente.toLocaleString("es-CO", { maximumFractionDigits: 4 })} %
        </p>
      )}
      <div className="mt-3 grid gap-2" role="radiogroup" aria-label="Opciones">
        {opciones.map((o) => (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={opcion === o.id}
            onClick={() => setOpcion(o.id)}
            className={cn(
              "flex min-h-14 items-center gap-3 rounded-xl border p-3 text-left text-base font-medium transition-colors",
              opcion === o.id ? "border-primary bg-primary/10 ring-2 ring-primary/30" : "hover:bg-muted",
            )}
          >
            <span className={cn("grid size-6 shrink-0 place-items-center rounded-full border-2", opcion === o.id ? "border-primary bg-primary" : "border-muted-foreground/40")}>
              {opcion === o.id && <span className="size-2 rounded-full bg-primary-foreground" />}
            </span>
            {o.texto}
          </button>
        ))}
      </div>
      <Button
        type="button"
        size="lg"
        className="mt-4 w-full"
        disabled={!opcion || !unidadId || pending}
        onClick={() =>
          start(async () => {
            const r = await votarAction({ votacionId, unidadId, opcionId: opcion! });
            if (r.ok) {
              setRecibo({ comprobante: r.data.comprobante, unidad: r.data.unidad });
              toast.success("Voto registrado");
              router.refresh();
            } else toast.error(r.error);
          })
        }
      >
        {pending ? <Loader2 className="animate-spin" /> : <ShieldCheck />} Confirmar voto
      </Button>
      <p className="mt-2 text-center text-xs text-muted-foreground">El voto no se puede cambiar después de confirmarlo.</p>
    </div>
  );
}
