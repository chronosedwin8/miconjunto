import { systemCtx } from "@/lib/auth/system-ctx";
import { conjuntoConfig } from "@/lib/conjunto/config";
import { nowBogota, periodoActual } from "@/lib/format";
import { generarCuotasMes, debeGenerarHoy } from "@/lib/cartera/generacion";
import { liquidarInteresesMora } from "@/lib/cartera/mora";
import { seguimientoAcuerdos } from "@/lib/cartera/acuerdos";
import { enviarRecordatorios, alertaTasaMora } from "@/lib/cartera/recordatorios";
import { vencerCertificados } from "@/lib/cartera/paz-y-salvo";
import { conjuntosActivos } from "./definitions";
import { defineJob } from "./registry";

/** Recorre los conjuntos activos con contexto de sistema; un error en uno no detiene los demás. */
async function porConjunto(fn: (ctx: Awaited<ReturnType<typeof systemCtx>>) => Promise<string | null>) {
  const out: string[] = [];
  for (const c of await conjuntosActivos()) {
    try {
      const ctx = await systemCtx(c.id);
      if (!ctx.conjunto.modulosActivos.length || ctx.conjunto.modulosActivos.includes("cartera")) {
        const r = await fn(ctx);
        if (r) out.push(`${c.nombre}: ${r}`);
      }
    } catch (e) {
      console.error(`[jobs:cartera] ${c.nombre}:`, (e as Error).message);
      out.push(`${c.nombre}: error ${(e as Error).message}`);
    }
  }
  return out.join(" · ") || "sin cambios";
}

// El día de generación varía por conjunto: el job corre a diario 00:10 y genera si hoy >= día configurado
// (idempotente: no duplica; si el servidor estuvo apagado el día exacto, se genera el siguiente día).
defineJob({
  name: "cartera-generar-cuotas",
  cron: "10 0 * * *",
  descripcion: "Generación mensual de cuotas de administración (día configurado, 00:10)",
  handler: () =>
    porConjunto(async (ctx) => {
      if (!debeGenerarHoy(conjuntoConfig(ctx), nowBogota().day)) return null;
      const r = await generarCuotasMes(ctx, periodoActual());
      return r.creadas ? `${r.creadas} cuotas ${r.periodo}` : null;
    }),
});

defineJob({
  name: "cartera-intereses-mora",
  cron: "0 1 * * *",
  descripcion: "Liquidación diaria de intereses de mora",
  handler: () =>
    porConjunto(async (ctx) => {
      const r = await liquidarInteresesMora(ctx);
      return r.interes ? `${r.unidades} unidades, $${r.interes}` : null;
    }),
});

defineJob({
  name: "cartera-recordatorios",
  cron: "0 8 * * *",
  descripcion: "Recordatorios de vencimiento y mora (respeta la Ley 2300)",
  handler: () =>
    porConjunto(async (ctx) => {
      const r = await enviarRecordatorios(ctx);
      await alertaTasaMora(ctx);
      return r.porVencer || r.mora ? `${r.porVencer} por vencer, ${r.mora} en mora, ${r.bloqueados} bloqueados por Ley 2300` : null;
    }),
});

defineJob({
  name: "cartera-seguimiento",
  cron: "30 1 * * *",
  descripcion: "Seguimiento de acuerdos de pago y vencimiento de paz y salvos",
  handler: () =>
    porConjunto(async (ctx) => {
      const a = await seguimientoAcuerdos(ctx);
      const v = await vencerCertificados(ctx);
      return a.CUMPLIDO || a.INCUMPLIDO || v ? `acuerdos cumplidos ${a.CUMPLIDO}, incumplidos ${a.INCUMPLIDO}; certificados vencidos ${v}` : null;
    }),
});
