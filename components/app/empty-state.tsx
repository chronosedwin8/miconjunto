import { Inbox } from "lucide-react";
import { cn } from "@/lib/utils";

export function EmptyState({
  titulo,
  descripcion,
  accion,
  icon: Icon = Inbox,
  className,
}: {
  titulo: string;
  descripcion?: string;
  accion?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-10 text-center", className)}>
      <Icon className="mb-3 size-10 text-muted-foreground" />
      <p className="font-semibold">{titulo}</p>
      {descripcion && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{descripcion}</p>}
      {accion && <div className="mt-4">{accion}</div>}
    </div>
  );
}
