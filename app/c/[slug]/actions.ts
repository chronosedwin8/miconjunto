"use server";

import { headers } from "next/headers";
import { toActionError, type ActionResult } from "@/lib/action";
import { clientIp } from "@/lib/rate-limit";
import { radicarPqrsPublica, type PqrsPublicaResult } from "@/lib/tickets/publico";

/**
 * PQRS pública (sin sesión) desde /c/<slug>. Valida con zod, limita la tasa por IP y correo,
 * descarta robots (campo trampa) y crea el ticket con origen PUBLICO usando el contexto de sistema.
 */
export async function radicarPqrsPublicaAction(input: unknown): Promise<ActionResult<PqrsPublicaResult>> {
  try {
    const ip = clientIp(await headers());
    return { ok: true, data: await radicarPqrsPublica(input, ip) };
  } catch (e) {
    return toActionError(e);
  }
}
