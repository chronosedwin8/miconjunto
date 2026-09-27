import { redirect } from "next/navigation";
import { can, type PermKey } from "@/lib/permisos";
import { requireCtx, type Ctx } from "./context";

/** Para páginas: exige sesión y alguno de los permisos; si no, muestra "sin permiso". */
export async function requirePage(perm: PermKey | PermKey[]): Promise<Ctx> {
  const ctx = await requireCtx();
  if (!can(ctx, perm)) redirect("/sin-permiso");
  return ctx;
}
