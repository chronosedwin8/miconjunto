"use client";

import { useEffect, useRef, useState } from "react";
import { Eraser } from "lucide-react";
import { useFieldError } from "@/components/form/action-form";

/** Firma en pantalla (canvas → dataURL PNG en un input oculto). */
export function SignaturePad({ name = "firma", label = "Firma", onChange, height = 180 }: { name?: string; label?: string; onChange?: (dataUrl: string) => void; height?: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [value, setValue] = useState("");
  const error = useFieldError(name);

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const resize = () => {
      const r = c.getBoundingClientRect();
      c.width = Math.round(r.width);
      c.height = height;
      const ctx = c.getContext("2d")!;
      ctx.lineWidth = 2.6;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#0a0a0a";
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, c.width, c.height);
    };
    resize();
  }, [height]);

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const commit = () => {
    const c = canvas.current;
    if (!c) return;
    // JPEG reduce el tamaño de la firma guardada
    const url = c.toDataURL("image/jpeg", 0.7);
    setValue(url);
    onChange?.(url);
  };
  const clear = () => {
    const c = canvas.current;
    if (!c) return;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, c.width, c.height);
    setValue("");
    onChange?.("");
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-base font-semibold">{label}</span>
        <button type="button" onClick={clear} className="inline-flex h-10 items-center gap-1 rounded-lg px-3 text-sm font-medium hover:bg-muted">
          <Eraser className="size-4" /> Borrar
        </button>
      </div>
      <input type="hidden" name={name} value={value} />
      <canvas
        ref={canvas}
        style={{ height }}
        aria-label="Área para firmar con el dedo"
        className={`w-full touch-none rounded-xl border-2 border-dashed bg-white ${error ? "border-destructive" : "border-foreground/40"}`}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          drawing.current = true;
          last.current = pos(e);
        }}
        onPointerMove={(e) => {
          if (!drawing.current || !last.current) return;
          const ctx = e.currentTarget.getContext("2d")!;
          const p = pos(e);
          ctx.beginPath();
          ctx.moveTo(last.current.x, last.current.y);
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
          last.current = p;
        }}
        onPointerUp={() => {
          drawing.current = false;
          last.current = null;
          commit();
        }}
        onPointerLeave={() => {
          if (drawing.current) commit();
          drawing.current = false;
        }}
      />
      {error ? <p className="text-sm font-medium text-destructive">{error}</p> : <p className="text-sm text-muted-foreground">Firma con el dedo dentro del recuadro.</p>}
    </div>
  );
}
