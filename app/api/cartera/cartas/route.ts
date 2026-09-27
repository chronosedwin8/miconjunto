import { NextResponse } from "next/server";
import { z } from "zod";
import { getCtx } from "@/lib/auth/context";
import { can } from "@/lib/permisos";
import { audit } from "@/lib/audit";
import { appUrl } from "@/lib/email";
import { cartasCobroPdf, PLANTILLA_CARTA_DEFECTO } from "@/lib/cartera/documentos";
import { horarioCobranzaPermitido, puedeContactar, registrarGestion } from "@/lib/cartera/cobranza";
import { toActionError } from "@/lib/action";

export const runtime = "nodejs";

const schema = z.object({ unidadIds: z.array(z.string().min(1)).min(1).max(300), plantilla: z.string().max(10000).optional(), registrar: z.boolean().default(true) });

/**
 * POST /api/cartera/cartas — genera en un solo PDF las cartas de cobro prejurídico de las unidades elegidas.
 * Si `registrar`, cada carta queda como gestión de cobro (canal CARTA) respetando la Ley 2300: se bloquea fuera
 * de horario y se omiten las unidades que ya recibieron una carta esta semana.
 */
export async function POST(req: Request) {
  const ctx = await getCtx();
  if (!ctx) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!can(ctx, "cartera.gestionar_cobro")) return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  try {
    const input = schema.parse(await req.json());
    const ahora = new Date();
    let ids = input.unidadIds;
    const omitidas: string[] = [];
    if (input.registrar) {
      const h = horarioCobranzaPermitido(ahora);
      if (!h.ok) return NextResponse.json({ error: `${h.motivo} Puedes descargar la vista previa sin registrar el envío.` }, { status: 409 });
      const ok: string[] = [];
      for (const id of ids) {
        const r = await puedeContactar(id, "CARTA", ahora);
        if (r.ok) ok.push(id);
        else omitidas.push(id);
      }
      ids = ok;
      if (!ids.length) return NextResponse.json({ error: "Todas las unidades elegidas ya recibieron una carta esta semana (Ley 2300)." }, { status: 409 });
    }
    const pdf = await cartasCobroPdf(ctx, ids, input.plantilla?.trim() || PLANTILLA_CARTA_DEFECTO, appUrl("/cuenta"), ahora);
    if (input.registrar) {
      for (const id of ids) await registrarGestion(ctx, { unidadId: id, canal: "CARTA", resultado: "Carta de cobro prejurídico generada" }, ahora);
    }
    await audit(ctx, "generar_cartas_cobro", "GestionCobro", null, undefined, { unidades: ids.length, omitidas: omitidas.length, registrar: input.registrar });
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="cartas-cobro-${ahora.toISOString().slice(0, 10)}.pdf"`,
        "X-Cartas": String(ids.length),
        "X-Omitidas": String(omitidas.length),
      },
    });
  } catch (e) {
    const r = toActionError(e);
    return NextResponse.json({ error: r.error }, { status: (e as { status?: number }).status ?? 400 });
  }
}
