import { Badge } from "@/components/ui/badge";
import { label, tone } from "@/lib/labels";

export function StatusBadge({ value, text, className }: { value: string | null | undefined; text?: string; className?: string }) {
  return (
    <Badge variant={tone(value)} className={className}>
      {text ?? label(value)}
    </Badge>
  );
}
