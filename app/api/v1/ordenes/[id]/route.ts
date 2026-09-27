import { z } from "zod";
import { apiHandler } from "@/lib/api/handler";
import { zs } from "@/lib/validation";
import { AppError } from "@/lib/errors";
import { fichaOrden, guardarOrden, iniciarOrden, marcarItemChecklist } from "@/lib/mantenimiento/service";

/** GET /api/v1/ordenes/:id — detalle (solo si está dentro del alcance del usuario). */
export const GET = apiHandler({ perm: "mantenimiento.ver" }, async ({ ctx, params }) => fichaOrden(ctx, params.id));

/**
 * PATCH /api/v1/ordenes/:id — acciones de ejecución:
 *   { "accion": "iniciar" } · { "accion": "checklist", "index": 0, "ok": true }
 *   { "accion": "editar", titulo, fechaProgramada, asignadoAId, proveedorId, ... } (requiere mantenimiento.gestionar)
 */
export const PATCH = apiHandler(
  {
    perm: ["mantenimiento.ejecutar", "mantenimiento.gestionar"],
    schema: z.discriminatedUnion("accion", [
      z.object({ accion: z.literal("iniciar") }),
      z.object({ accion: z.literal("checklist"), index: z.number().int().min(0), ok: z.boolean() }),
      z.object({
        accion: z.literal("editar"),
        titulo: zs.text(3, 150),
        descripcion: zs.optText(3000),
        activoId: zs.optId(),
        zonaId: zs.optId(),
        proveedorId: zs.optId(),
        asignadoAId: zs.optId(),
        fechaProgramada: zs.date(),
        checklist: z.array(z.string().min(1)).optional(),
        costo: zs.optMoney(),
      }),
    ]),
  },
  async ({ ctx, input, params }) => {
    if (input.accion === "iniciar") return iniciarOrden(ctx, params.id);
    if (input.accion === "checklist") return marcarItemChecklist(ctx, params.id, input.index, input.ok);
    if (!ctx.permisos.has("mantenimiento.gestionar") && !ctx.esSuperAdmin) {
      throw new AppError("No tienes permiso para editar la orden.", 403);
    }
    return guardarOrden(ctx, { ...input, id: params.id });
  },
);
