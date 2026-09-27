"use client";

import type { ActionResult, AnyAction } from "@/components/form/action-form";
import { conRespaldoOffline, type TipoOperacion } from "@/lib/porteria/offline";

/**
 * Envuelve una Server Action de portería para que funcione sin conexión con <ActionForm>:
 * si no hay red, la operación se guarda en la cola (IndexedDB) y se sincroniza sola.
 */
export function offlineAction(tipo: TipoOperacion, descripcion: (input: Record<string, unknown>) => string, action: AnyAction): AnyAction {
  return async (input: Record<string, unknown>): Promise<ActionResult> => {
    const r = await conRespaldoOffline({ tipo, payload: input, descripcion: descripcion(input) }, (p) => action(p));
    if ("offline" in r && r.offline) return { ok: true, data: { offline: true }, message: "Sin conexión: quedó guardado y se sincronizará automáticamente." };
    return r as ActionResult;
  };
}
