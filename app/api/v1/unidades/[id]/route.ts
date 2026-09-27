import { apiHandler } from "@/lib/api/handler";
import { fichaUnidad } from "@/lib/conjunto/service";

/** GET /api/v1/unidades/:id — ficha de la unidad con parqueaderos, bodegas, vehículos y mascotas. */
export const GET = apiHandler({ perm: "conjunto.ver" }, async ({ ctx, params }) => {
  const u = await fichaUnidad(ctx, params.id);
  return { ...u, vinculos: u.vinculos.map((v) => ({ id: v.id, tipo: v.tipo, estado: v.estado, personaId: v.personaId, nombre: `${v.persona.nombres} ${v.persona.apellidos}` })) };
});
