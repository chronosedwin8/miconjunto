import { z } from "zod";
import { apiHandler } from "@/lib/api/handler";
import { AppError } from "@/lib/errors";
import { can } from "@/lib/permisos";
import { filtroPagos } from "@/lib/cartera/filtros";
import { registrarPagoManual } from "@/lib/cartera/operaciones";

/** GET /api/v1/cartera/pagos?unidad=&estado=&medio=&conciliado=si|no&desde=&hasta=&take=&skip= */
export const GET = apiHandler(
  {
    perm: "pagos.ver",
    schema: z.object({
      unidad: z.string().optional(),
      estado: z.string().optional(),
      medio: z.string().optional(),
      conciliado: z.enum(["si", "no"]).optional(),
      desde: z.string().optional(),
      hasta: z.string().optional(),
      q: z.string().optional(),
      take: z.coerce.number().int().min(1).max(500).default(100),
      skip: z.coerce.number().int().min(0).default(0),
    }),
  },
  async ({ ctx, input }) => {
    const { take, skip, ...f } = input;
    if (!can(ctx, "pagos.ver_todos") && (!f.unidad || !ctx.unidadesPropias.includes(f.unidad))) throw new AppError("Indica una unidad propia (parámetro unidad).", 403);
    const where = filtroPagos(f);
    const [items, total] = await Promise.all([
      ctx.db.pago.findMany({ where, include: { unidad: { select: { codigo: true } }, aplicaciones: { where: { deletedAt: null }, select: { cuotaId: true, valor: true } } }, orderBy: { fecha: "desc" }, take, skip }),
      ctx.db.pago.count({ where }),
    ]);
    return { total, items: items.map(({ datosPasarela: _d, ...p }) => p) };
  },
);

/** POST /api/v1/cartera/pagos — pago manual { unidadId, valor, fecha (ISO), medio, referenciaExterna?, comprobanteUrl?, observaciones?, cuotaIds? } */
export const POST = apiHandler(
  {
    perm: "pagos.registrar",
    schema: z.object({
      unidadId: z.string().min(1),
      valor: z.number().positive(),
      fecha: z.coerce.date(),
      medio: z.enum(["EFECTIVO", "TRANSFERENCIA", "CONSIGNACION", "PSE", "NEQUI", "BANCOLOMBIA_QR", "TARJETA"]),
      referenciaExterna: z.string().max(80).optional(),
      comprobanteUrl: z.string().max(500).optional(),
      observaciones: z.string().max(500).optional(),
      cuotaIds: z.array(z.string()).optional(),
    }),
  },
  async ({ ctx, input }) => registrarPagoManual(ctx, input),
);
