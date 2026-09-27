"use client";

import { useEffect, useRef, useState } from "react";
import { Eraser } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Firma manuscrita en canvas (dedo o mouse). Entrega un PNG en data URL mediante `onChange`. */
export function FirmaPad({ onChange, alto = 180 }: { onChange: (dataUrl: string | null) => void; alto?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const dibujando = useRef(false);
  const [vacia, setVacia] = useState(true);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ratio = window.devicePixelRatio || 1;
    c.width = c.offsetWidth * ratio;
    c.height = alto * ratio;
    const ctx = c.getContext("2d")!;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#111827";
  }, [alto]);

  const punto = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  return (
    <div className="space-y-2">
      <canvas
        ref={ref}
        style={{ height: alto, touchAction: "none" }}
        className="w-full rounded-lg border-2 border-dashed bg-white"
        aria-label="Área para firmar"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          dibujando.current = true;
          const ctx = e.currentTarget.getContext("2d")!;
          const p = punto(e);
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
        }}
        onPointerMove={(e) => {
          if (!dibujando.current) return;
          const ctx = e.currentTarget.getContext("2d")!;
          const p = punto(e);
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
          if (vacia) setVacia(false);
        }}
        onPointerUp={(e) => {
          dibujando.current = false;
          if (!vacia) onChange(e.currentTarget.toDataURL("image/png"));
        }}
      />
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{vacia ? "Firma con el dedo o el mouse" : "Firma capturada"}</span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            const c = ref.current;
            if (!c) return;
            c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
            setVacia(true);
            onChange(null);
          }}
        >
          <Eraser /> Borrar
        </Button>
      </div>
    </div>
  );
}
