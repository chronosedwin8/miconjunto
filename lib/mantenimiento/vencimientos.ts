import type { Ctx } from "@/lib/auth/context";
import type { PermKey } from "@/lib/permisos/catalog";
import { notify, usuariosConPermiso } from "@/lib/notificaciones";
import { fecha as fmtFecha, startOfDayBogota } from "@/lib/format";
import { label } from "@/lib/labels";
import { actualizarEstadosContratos } from "@/lib/proveedores/service";
import { diasHasta, semaforoVencimiento, tocaAvisar, type Semaforo } from "./calculos";

export type TipoVencimiento = "GARANTIA" | "DOCUMENTO_PROVEEDOR" | "CONTRATO" | "EPS" | "ARL" | "LEGAL";

export type Vencimiento = {
  tipo: TipoVencimiento;
  id: string;
  titulo: string;
  detalle: string;
  fecha: Date;
  dias: number;
  semaforo: Semaforo;
  diasAlerta: number;
  enlace: string;
  perm: PermKey;
};

const TIPO_LABEL: Record<TipoVencimiento, string> = {
  GARANTIA: "Garantía",
  DOCUMENTO_PROVEEDOR: "Documento de proveedor",
  CONTRATO: "Contrato",
  EPS: "EPS de empleado",
  ARL: "ARL de empleado",
  LEGAL: "Mantenimiento legal",
};
export const tipoVencimientoLabel = (t: TipoVencimiento) => TIPO_LABEL[t];

/**
 * Todos los vencimientos del conjunto dentro de la ventana (vencidos incluidos): garantías de activos,
 * documentos de proveedores, contratos, EPS/ARL de empleados y mantenimientos legales (certificación
 * de ascensores, extintores, piscina, planta eléctrica).
 */
export async function vencimientos(ctx: Ctx, opts: { ventanaDias?: number; hoy?: Date; vencidosDesdeDias?: number } = {}) {
  const hoy = opts.hoy ?? startOfDayBogota();
  const ventana = opts.ventanaDias ?? 60;
  const limite = new Date(hoy.getTime() + ventana * 86_400_000);
  const piso = new Date(hoy.getTime() - (opts.vencidosDesdeDias ?? 365) * 86_400_000);
  const rango = { gte: piso, lte: limite };
  const [activos, docs, contratos, empleados, legales] = await Promise.all([
    ctx.db.activo.findMany({ where: { garantiaVence: rango, estado: { not: "DADO_DE_BAJA" } }, select: { id: true, nombre: true, garantiaVence: true, categoria: true } }),
    ctx.db.documentoProveedor.findMany({ where: { vence: rango, proveedor: { activo: true, deletedAt: null } }, include: { proveedor: { select: { id: true, razonSocial: true } } } }),
    ctx.db.contrato.findMany({ where: { estado: { not: "TERMINADO" }, fin: { gte: piso } }, include: { proveedor: { select: { razonSocial: true } } } }),
    ctx.db.empleado.findMany({ where: { activo: true, OR: [{ epsVence: rango }, { arlVence: rango }] } }),
    ctx.db.planMantenimiento.findMany({ where: { tipo: "LEGAL", activoPlan: true, proximaFecha: { lte: limite } }, include: { activo: { select: { nombre: true } } } }),
  ]);
  const out: Vencimiento[] = [];
  const push = (v: Omit<Vencimiento, "dias" | "semaforo">) => {
    const semaforo = semaforoVencimiento(v.fecha, hoy, v.diasAlerta);
    if (!semaforo || semaforo === "VIGENTE") return;
    out.push({ ...v, dias: diasHasta(v.fecha, hoy), semaforo });
  };
  for (const a of activos)
    push({ tipo: "GARANTIA", id: a.id, titulo: `Garantía de ${a.nombre}`, detalle: a.categoria, fecha: a.garantiaVence!, diasAlerta: 30, enlace: `/activos/${a.id}`, perm: "activos.editar" });
  for (const d of docs)
    push({ tipo: "DOCUMENTO_PROVEEDOR", id: d.id, titulo: `${label(d.tipo)} de ${d.proveedor.razonSocial}`, detalle: "Documento de proveedor", fecha: d.vence!, diasAlerta: 30, enlace: `/proveedores/${d.proveedor.id}`, perm: "proveedores.editar" });
  for (const c of contratos)
    push({ tipo: "CONTRATO", id: c.id, titulo: `Contrato: ${c.objeto}`, detalle: c.proveedor.razonSocial + (c.renovacionAutomatica ? " · renovación automática" : ""), fecha: c.fin, diasAlerta: c.diasAlerta, enlace: `/proveedores/${c.proveedorId}`, perm: "proveedores.editar" });
  for (const e of empleados) {
    if (e.epsVence) push({ tipo: "EPS", id: `${e.id}-eps`, titulo: `EPS de ${e.nombre}`, detalle: e.cargo, fecha: e.epsVence, diasAlerta: 30, enlace: `/empleados?q=${encodeURIComponent(e.nombre)}`, perm: "empleados.editar" });
    if (e.arlVence) push({ tipo: "ARL", id: `${e.id}-arl`, titulo: `ARL de ${e.nombre}`, detalle: e.cargo, fecha: e.arlVence, diasAlerta: 30, enlace: `/empleados?q=${encodeURIComponent(e.nombre)}`, perm: "empleados.editar" });
  }
  for (const p of legales)
    push({ tipo: "LEGAL", id: p.id, titulo: p.nombre, detalle: p.activo?.nombre ?? "Mantenimiento legal", fecha: p.proximaFecha, diasAlerta: Math.max(30, p.diasAnticipacion), enlace: `/mantenimiento/planes?plan=${p.id}`, perm: "mantenimiento.crear" });
  return out.sort((a, b) => a.dias - b.dias);
}

/**
 * Job diario (07:00): actualiza estados de contratos (y renueva los automáticos) y notifica a la
 * administración los vencimientos que llegan hoy a un umbral (30/15/7/3/1/0 días y el día después).
 * Un solo resumen por usuario, según los permisos de cada tipo de vencimiento.
 */
export async function revisarVencimientos(ctx: Ctx, hoy = new Date()) {
  const { renovados } = await actualizarEstadosContratos(ctx, hoy);
  const todos = await vencimientos(ctx, { hoy: startOfDayBogota(hoy), vencidosDesdeDias: 2 });
  const avisar = todos.filter((v) => tocaAvisar(v.fecha, hoy, v.diasAlerta));
  const porUsuario = new Map<string, string[]>();
  const perms = [...new Set(avisar.map((v) => v.perm))];
  for (const perm of perms) {
    const users = await usuariosConPermiso(ctx.conjuntoId, [perm]);
    for (const v of avisar.filter((x) => x.perm === perm)) {
      const linea = `${v.titulo}: ${v.dias < 0 ? "venció" : v.dias === 0 ? "vence hoy" : `vence en ${v.dias} días`} (${fmtFecha(v.fecha)})`;
      for (const u of users) porUsuario.set(u, [...(porUsuario.get(u) ?? []), linea]);
    }
  }
  for (const r of renovados) {
    const users = await usuariosConPermiso(ctx.conjuntoId, ["proveedores.editar"]);
    for (const u of users) porUsuario.set(u, [...(porUsuario.get(u) ?? []), `Contrato renovado automáticamente: ${r.objeto} (${r.proveedor}) hasta el ${fmtFecha(r.fin)}`]);
  }
  for (const [usuarioId, lineas] of porUsuario) {
    await notify({
      conjuntoId: ctx.conjuntoId,
      usuarioIds: [usuarioId],
      titulo: lineas.length === 1 ? "Vencimiento próximo" : `${lineas.length} vencimientos por atender`,
      cuerpo: lineas.slice(0, 8).join(" · ") + (lineas.length > 8 ? ` · y ${lineas.length - 8} más` : ""),
      enlace: "/mantenimiento/vencimientos",
      tipo: "VENCIMIENTOS",
      canales: ["push", "email"],
    });
  }
  return { avisos: avisar.length, usuarios: porUsuario.size, renovados: renovados.length };
}
