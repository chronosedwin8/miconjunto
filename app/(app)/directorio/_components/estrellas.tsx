import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

export function Estrellas({ valor, className }: { valor: number; className?: string }) {
  return (
    <span className={cn("inline-flex align-middle", className)} aria-label={`${valor.toFixed(1)} de 5 estrellas`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={cn("size-4", valor >= i - 0.25 ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40")} />
      ))}
    </span>
  );
}
