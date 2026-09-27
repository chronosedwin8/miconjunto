import { redirect } from "next/navigation";
import { Building2, ChevronRight } from "lucide-react";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/context";
import { selectConjuntoAction, logoutAction } from "../actions";

export const metadata = { title: "Elegir conjunto" };

export default async function SeleccionarConjuntoPage() {
  const su = await getSessionUser();
  if (!su) redirect("/login");
  const membresias = await prisma.membresiaConjunto.findMany({
    where: { usuarioId: su.userId, estado: "ACTIVA", deletedAt: null, conjunto: { deletedAt: null } },
    include: { conjunto: true, rol: true },
    orderBy: { conjunto: { nombre: "asc" } },
  });
  const extra = su.esSuperAdmin
    ? await prisma.conjunto.findMany({ where: { deletedAt: null, id: { notIn: membresias.map((m) => m.conjuntoId) } }, orderBy: { nombre: "asc" } })
    : [];
  const opciones = [
    ...membresias.map((m) => ({ id: m.conjuntoId, nombre: m.conjunto.nombre, ciudad: m.conjunto.ciudad, rol: m.rol.nombre })),
    ...extra.map((c) => ({ id: c.id, nombre: c.nombre, ciudad: c.ciudad, rol: "Soporte SuperAdmin" })),
  ];
  return (
    <>
      <h1 className="mb-1 text-2xl font-bold">¿A qué conjunto quieres entrar?</h1>
      <p className="mb-6 text-sm text-muted-foreground">Tienes acceso a varios conjuntos. Puedes cambiar después desde tu menú.</p>
      {opciones.length === 0 && (
        <p className="rounded-lg bg-muted p-4 text-sm">
          Tu cuenta aún no está vinculada a ningún conjunto. Pide a la administración que te envíe una invitación.
        </p>
      )}
      <ul className="space-y-2">
        {opciones.map((o) => (
          <li key={o.id}>
            <form action={selectConjuntoAction.bind(null, o.id)}>
              <button className="flex w-full items-center gap-3 rounded-xl border bg-card p-4 text-left hover:bg-muted">
                <Building2 className="size-6 text-primary" />
                <span className="flex-1">
                  <span className="block font-semibold">{o.nombre}</span>
                  <span className="block text-xs text-muted-foreground">
                    {o.ciudad ?? ""} · {o.rol}
                  </span>
                </span>
                <ChevronRight className="size-5 text-muted-foreground" />
              </button>
            </form>
          </li>
        ))}
      </ul>
      {su.esSuperAdmin && (
        <a href="/superadmin" className="mt-4 block text-center text-sm text-primary">
          Ir al panel SuperAdmin
        </a>
      )}
      <form action={logoutAction} className="mt-6 text-center">
        <button className="text-sm text-muted-foreground underline">Cerrar sesión</button>
      </form>
    </>
  );
}
