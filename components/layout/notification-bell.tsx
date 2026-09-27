"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { toast } from "sonner";
import { useRealtime } from "@/components/realtime/use-realtime";

export function NotificationBell({ initialCount }: { initialCount: number }) {
  const [count, setCount] = useState(initialCount);
  const router = useRouter();
  useRealtime(
    ["conjunto"],
    (e) => {
      if (e.tipo === "notificacion") {
        setCount((c) => c + 1);
        const d = e.data as { titulo?: string; cuerpo?: string; enlace?: string } | undefined;
        toast(d?.titulo ?? "Nueva notificación", {
          description: d?.cuerpo,
          action: d?.enlace ? { label: "Ver", onClick: () => router.push(d.enlace!) } : undefined,
        });
      }
    },
    {
      onPoll: async () => {
        const r = await fetch("/api/notificaciones/conteo");
        if (r.ok) setCount(((await r.json()) as { count: number }).count);
      },
    },
  );
  return (
    <Link
      href="/notificaciones"
      className="relative inline-flex size-11 items-center justify-center rounded-lg hover:bg-muted"
      aria-label={count > 0 ? `Notificaciones, ${count} sin leer` : "Notificaciones"}
    >
      <Bell className="size-5" />
      {count > 0 && (
        <span className="absolute right-1.5 top-1.5 grid min-w-5 place-items-center rounded-full bg-destructive px-1 text-[10px] font-bold text-white">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
