import { Building2, CircleHelp, Ellipsis, FileWarning, House, Lightbulb, MessageSquareWarning, PawPrint, ShieldAlert, ThumbsUp, Volume2 } from "lucide-react";
import type { TipoTicket } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { estadoSla, type EstadoSla } from "@/lib/tickets/reglas";
import { fecha, fechaHora } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Ícono por tipo de ticket (sirve en componentes de servidor y de cliente). */
export const TIPO_ICONO: Record<TipoTicket, React.ComponentType<{ className?: string }>> = {
  DANO_ZONA_COMUN: Building2,
  DANO_UNIDAD: House,
  SEGURIDAD: ShieldAlert,
  PETICION: CircleHelp,
  QUEJA: MessageSquareWarning,
  RECLAMO: FileWarning,
  SUGERENCIA: Lightbulb,
  FELICITACION: ThumbsUp,
  RUIDO: Volume2,
  MASCOTAS: PawPrint,
  OTRO: Ellipsis,
};

export function TipoIcono({ tipo, className }: { tipo: TipoTicket; className?: string }) {
  const I = TIPO_ICONO[tipo];
  return <I className={cn("size-4", className)} />;
}

const SLA_TEXTO: Record<EstadoSla, string> = {
  VENCIDO: "Vencido",
  POR_VENCER: "Vence pronto",
  A_TIEMPO: "A tiempo",
  CUMPLIDO: "Resuelto a tiempo",
  INCUMPLIDO: "Resuelto fuera de plazo",
};

/** Insignia del SLA con la fecha límite. */
export function SlaBadge({ t, conFecha = true }: { t: { fechaLimite: Date; estado: Parameters<typeof estadoSla>[0]["estado"]; resueltoEn?: Date | null }; conFecha?: boolean }) {
  const s = estadoSla(t);
  const variant = s === "VENCIDO" || s === "INCUMPLIDO" ? "destructive" : s === "POR_VENCER" ? "warning" : s === "A_TIEMPO" ? "outline" : "success";
  return (
    <Badge variant={variant} title={`Fecha límite: ${fechaHora(t.fechaLimite)}`}>
      {SLA_TEXTO[s]}
      {conFecha && (s === "A_TIEMPO" || s === "POR_VENCER" || s === "VENCIDO") ? ` · ${fecha(t.fechaLimite)}` : ""}
    </Badge>
  );
}

export function Estrellas({ valor, className }: { valor: number; className?: string }) {
  return (
    <span className={cn("tracking-tight text-amber-500", className)} aria-label={`${valor} de 5 estrellas`}>
      {"★".repeat(valor)}
      <span className="text-muted-foreground/40">{"★".repeat(5 - valor)}</span>
    </span>
  );
}
