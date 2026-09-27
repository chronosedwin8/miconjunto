import { z } from "zod";
import { apiHandler } from "@/lib/api/handler";
import { agregarEvidencias } from "@/lib/mantenimiento/service";

/** POST /api/v1/ordenes/:id/evidencias — { urls: string[] (subidas con /api/upload), momento: "antes" | "despues" | "otra" }. */
export const POST = apiHandler(
  {
    perm: ["mantenimiento.ejecutar", "mantenimiento.gestionar"],
    schema: z.object({ urls: z.array(z.string().min(1)).min(1).max(10), momento: z.enum(["antes", "despues", "otra"]).default("otra") }),
  },
  async ({ ctx, input, params }) => ({ evidencias: await agregarEvidencias(ctx, params.id, input.urls, input.momento) }),
);
