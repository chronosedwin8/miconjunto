import { prisma } from "@/lib/db";
import { insensitive, spGet, type SP } from "@/lib/pagination";
import { fechaHora } from "@/lib/format";
import { ListToolbar } from "@/components/app/list-toolbar";
import { DataList } from "@/components/app/data-list";
import { Button } from "@/components/ui/button";
import { impersonarAction } from "../actions";

export const metadata = { title: "Usuarios de la plataforma" };

export default async function UsuariosSaPage({ searchParams }: { searchParams: Promise<SP> }) {
  const q = spGet(await searchParams, "q");
  const usuarios = await prisma.usuario.findMany({
    where: { deletedAt: null, ...(q ? { OR: [{ nombre: insensitive(q) }, { email: insensitive(q) }] } : {}) },
    include: { membresias: { where: { deletedAt: null }, include: { conjunto: true, rol: true } } },
    orderBy: { nombre: "asc" },
    take: 100,
  });
  return (
    <>
      <ListToolbar placeholder="Buscar usuario…" />
      <DataList
        rows={usuarios}
        rowKey={(u) => u.id}
        columns={[
          { key: "n", header: "Usuario", primary: true, cell: (u) => `${u.nombre} · ${u.email}` },
          { key: "c", header: "Conjuntos", cell: (u) => u.membresias.map((m) => `${m.conjunto.nombre} (${m.rol.nombre})`).join(", ") || (u.esSuperAdmin ? "SuperAdmin" : "—") },
          { key: "a", header: "Último acceso", cell: (u) => fechaHora(u.ultimoAcceso) },
          {
            key: "i",
            header: "",
            cell: (u) =>
              u.esSuperAdmin ? null : (
                <form action={impersonarAction.bind(null, u.id)}>
                  <Button size="sm" variant="outline">
                    Impersonar
                  </Button>
                </form>
              ),
          },
        ]}
      />
    </>
  );
}
