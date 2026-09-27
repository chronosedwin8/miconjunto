import { apiHandler } from "@/lib/api/handler";
import { enviarConvocatoria } from "@/lib/asambleas/service";

/** POST /api/v1/asambleas/:id/convocar — valida la antelación (Ley 675 art. 39) y envía la convocatoria. */
export const POST = apiHandler({ perm: "asambleas.crear" }, async ({ ctx, params }) => {
  const r = await enviarConvocatoria(ctx, params.id);
  return { estado: r.asamblea.estado, destinatarios: r.destinatarios, usuarios: r.usuarios, advertencia: r.advertencia };
});
