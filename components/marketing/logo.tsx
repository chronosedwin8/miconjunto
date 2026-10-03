import Link from "next/link";
import { Building2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function Logo({ className, claro }: { className?: string; claro?: boolean }) {
  return (
    <Link href="/" className={cn("flex items-center gap-2 font-bold tracking-tight", className)} aria-label="Conjunto360, inicio">
      <span className={cn("grid size-9 place-items-center rounded-xl", claro ? "bg-white/15 text-white" : "bg-primary text-primary-foreground")}>
        <Building2 className="size-5" aria-hidden />
      </span>
      <span className={cn("text-lg", claro && "text-white")}>Conjunto360</span>
    </Link>
  );
}
