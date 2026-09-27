import { redirect } from "next/navigation";
import { getSessionUser } from "./context";

export async function requireSuperAdmin() {
  const su = await getSessionUser();
  if (!su) redirect("/login");
  if (!su.esSuperAdmin) redirect("/inicio");
  return su;
}
