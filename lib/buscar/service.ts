import type { Ctx } from "@/lib/auth/context";
import { can, seesAll } from "@/lib/permisos";
import { nombreCompleto, fechaHora } from "@/lib/format";

export type SearchHit = { tipo: string; titulo: string; subtitulo?: string; href: string };

/** Búsqueda global: unidades, personas, placas, tickets, reservas, paquetes, documentos y códigos. */
export async function globalSearch(ctx: Ctx, qRaw: string): Promise<SearchHit[]> {
  const q = qRaw.trim();
  if (q.length < 2) return [];
  const db = ctx.db;
  const ci = { contains: q, mode: "insensitive" as const };
  const hits: SearchHit[] = [];
  const own = (field = "unidadId") => (seesAll(ctx, "residentes") ? {} : { [field]: { in: ctx.unidadIds } });

  const tasks: Promise<void>[] = [];

  if (can(ctx, "conjunto.ver")) {
    tasks.push(
      db.unidad
        .findMany({ where: { codigo: ci, ...(seesAll(ctx, "residentes") ? {} : { id: { in: ctx.unidadIds } }) }, take: 6, include: { torre: true } })
        .then((rs) =>
          rs.forEach((u) =>
            hits.push({ tipo: "Unidad", titulo: u.codigo, subtitulo: u.torre?.nombre ?? u.tipo, href: seesAll(ctx, "residentes") ? `/conjunto/unidades/${u.id}` : `/mi-hogar` }),
          ),
        ),
    );
  }
  if (can(ctx, "residentes.ver_todos")) {
    tasks.push(
      db.persona
        .findMany({
          where: { anonimizada: false, OR: [{ nombres: ci }, { apellidos: ci }, { numeroDocumento: { contains: q } }] },
          take: 8,
          include: { vinculos: { where: { deletedAt: null, estado: "ACTIVO" }, include: { unidad: true }, take: 2 } },
        })
        .then((rs) =>
          rs.forEach((p) =>
            hits.push({
              tipo: "Persona",
              titulo: nombreCompleto(p),
              subtitulo: p.vinculos.map((v) => `${v.unidad.codigo} · ${v.tipo.toLowerCase()}`).join(", "),
              href: `/residentes/${p.id}`,
            }),
          ),
        ),
    );
  }
  if (can(ctx, ["vehiculos.ver_todos", "vehiculos.ver"])) {
    tasks.push(
      db.vehiculo
        .findMany({ where: { placa: { contains: q.toUpperCase().replace(/\s/g, "") }, ...own() }, take: 5, include: { unidad: true } })
        .then((rs) =>
          rs.forEach((v) => hits.push({ tipo: "Vehículo", titulo: v.placa, subtitulo: `${v.unidad.codigo} · ${v.marca ?? ""} ${v.color ?? ""}`, href: seesAll(ctx, "vehiculos") ? `/conjunto/unidades/${v.unidadId}` : "/mi-hogar" })),
        ),
    );
  }
  if (can(ctx, ["tickets.ver", "tickets.ver_todos"])) {
    tasks.push(
      db.ticket
        .findMany({
          where: {
            OR: [{ radicado: ci }, { titulo: ci }],
            ...(seesAll(ctx, "tickets") ? {} : { OR: [{ solicitanteId: ctx.userId }, { unidadId: { in: ctx.unidadIds } }, { asignadoAId: ctx.userId }] }),
          },
          take: 5,
        })
        .then((rs) => rs.forEach((t) => hits.push({ tipo: "Ticket", titulo: `${t.radicado} · ${t.titulo}`, subtitulo: t.estado.toLowerCase(), href: `/tickets/${t.id}` }))),
    );
  }
  if (can(ctx, ["paqueteria.ver", "paqueteria.ver_todos"])) {
    tasks.push(
      db.paquete
        .findMany({ where: { OR: [{ guia: ci }, { destinatario: ci }, { transportadora: ci }], ...own() }, take: 5, include: { unidad: true } })
        .then((rs) =>
          rs.forEach((p) =>
            hits.push({ tipo: "Paquete", titulo: `${p.unidad.codigo} · ${p.transportadora ?? p.tipo}`, subtitulo: `${p.estado.toLowerCase()} · ${fechaHora(p.llegadaEn)}`, href: seesAll(ctx, "paqueteria") ? `/porteria/paquetes?q=${p.unidad.codigo}` : "/paquetes" }),
          ),
        ),
    );
  }
  if (can(ctx, ["reservas.ver", "reservas.ver_todos"])) {
    tasks.push(
      db.reserva
        .findMany({ where: { OR: [{ zona: { nombre: ci } }, { unidad: { codigo: ci } }], ...(seesAll(ctx, "reservas") ? {} : { unidadId: { in: ctx.unidadIds } }) }, take: 5, include: { zona: true, unidad: true }, orderBy: { inicio: "desc" } })
        .then((rs) => rs.forEach((r) => hits.push({ tipo: "Reserva", titulo: `${r.zona.nombre} · ${r.unidad.codigo}`, subtitulo: `${fechaHora(r.inicio)} · ${r.estado.toLowerCase()}`, href: `/reservas/detalle/${r.id}` }))),
    );
  }
  if (can(ctx, "documentos.ver")) {
    tasks.push(
      db.documento
        .findMany({ where: { titulo: ci, publicado: true }, take: 5 })
        .then((rs) => rs.forEach((d) => hits.push({ tipo: "Documento", titulo: d.titulo, subtitulo: d.categoria.toLowerCase(), href: `/documentos?doc=${d.id}` }))),
    );
  }
  if (/^\d{6}$/.test(q) && can(ctx, ["porteria.registrar", "visitantes.ver_todos"])) {
    tasks.push(
      db.autorizacionIngreso
        .findMany({ where: { codigo: q, estado: "ACTIVA" }, take: 3, include: { unidad: true } })
        .then((rs) => rs.forEach((a) => hits.push({ tipo: "Autorización", titulo: `${a.nombreVisitante} → ${a.unidad.codigo}`, subtitulo: `Código ${a.codigo}`, href: `/porteria?codigo=${a.codigo}` }))),
    );
  }
  await Promise.all(tasks);
  return hits.slice(0, 30);
}
