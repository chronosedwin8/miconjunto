import Link from "next/link";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  hint,
  href,
  tone = "default",
  icon: Icon,
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  href?: string;
  tone?: "default" | "success" | "warning" | "danger" | "primary";
  icon?: React.ComponentType<{ className?: string }>;
  className?: string;
}) {
  const toneCls = {
    default: "",
    primary: "border-primary/30 bg-primary/5",
    success: "border-success/30 bg-success/5",
    warning: "border-warning/30 bg-warning/5",
    danger: "border-destructive/30 bg-destructive/5",
  }[tone];
  const valueCls = {
    default: "",
    primary: "text-primary",
    success: "text-success",
    warning: "text-warning",
    danger: "text-destructive",
  }[tone];
  const body = (
    <div className={cn("h-full rounded-xl border bg-card p-4", toneCls, href && "transition-colors hover:bg-muted/60", className)}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        {Icon && <Icon className="size-4 text-muted-foreground" />}
      </div>
      <p className={cn("mt-1 text-2xl font-bold tabular-nums", valueCls)}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
  return href ? (
    <Link href={href} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}
