import { registerExporter } from "@/lib/export/registry";
import { can } from "@/lib/permisos";
import { toNumber } from "@/lib/format";
import { label } from "@/lib/labels";
import { carteraPorUnidad } from "./tablero";
import { filtroCuotas, filtroGestiones, filtroPagos } from "./filtros";
import { RANGO_LABEL } from "./calculos";

registerExporter("cartera", {
  perm: "cartera.ver_todos",
  titulo: "Cartera por unidad (edad de la mora)",
  columns: [
    { header: "Unidad", key: "codigo" },
    { header: "Torre", key: "torre" },
    { header: "Propietario", key: "propietario", width: 30 },
    { header: "Saldo total", key: "total", tipo: "moneda", width: 16 },
    { header: "Vencido", key: "vencido", tipo: "moneda", width: 16 },
    { header: "Por vencer", key: "porVencer", tipo: "moneda", width: 16 },
    { header: "Saldo a favor", key: "saldoAFavor", tipo: "moneda", width: 16 },
    { header: "1–30", key: "r1", tipo: "moneda" },
    { header: "31–60", key: "r2", tipo: "moneda" },
    { header: "61–90", key: "r3", tipo: "moneda" },
    { header: "91–120", key: "r4", tipo: "moneda" },
    { header: "+120", key: "r5", tipo: "moneda" },
    { header: "Días de mora", key: "dias", tipo: "numero" },
    { header: "Rango", key: "rango" },
    { header: "Acuerdo vigente", key: "acuerdo" },
  ],
  rows: async (ctx, sp) => {
    const verNombres = can(ctx, "secciones.lista_morosos");
    let filas = await carteraPorUnidad(ctx, { torreId: sp.torre });
    if (sp.rango) filas = filas.filter((f) => f.rango === sp.rango);
    if (sp.solo === "mora") filas = filas.filter((f) => f.vencido > 0);
    return filas.map((f) => ({
      codigo: f.codigo,
      torre: f.torre ?? "Casas",
      propietario: verNombres ? f.propietario : "",
      total: f.total,
      vencido: f.vencido,
      porVencer: f.porVencer,
      saldoAFavor: f.saldoAFavor,
      r1: f.aging["1_30"],
      r2: f.aging["31_60"],
      r3: f.aging["61_90"],
      r4: f.aging["91_120"],
      r5: f.aging.MAS_120,
      dias: f.diasMora,
      rango: RANGO_LABEL[f.rango],
      acuerdo: f.enAcuerdo ? "Sí" : "",
    }));
  },
});

registerExporter("cartera-cuotas", {
  perm: "cartera.ver_todos",
  titulo: "Cuotas y cargos",
  columns: [
    { header: "Unidad", key: "unidad" },
    { header: "Periodo", key: "periodo" },
    { header: "Concepto", key: "concepto", width: 22 },
    { header: "Descripción", key: "descripcion", width: 36 },
    { header: "Emisión", key: "emision", tipo: "fecha" },
    { header: "Vencimiento", key: "vence", tipo: "fecha" },
    { header: "Valor", key: "valor", tipo: "moneda" },
    { header: "IVA", key: "iva", tipo: "moneda" },
    { header: "Descuento", key: "descuento", tipo: "moneda" },
    { header: "Saldo", key: "saldo", tipo: "moneda" },
    { header: "Estado", key: "estado" },
    { header: "Referencia de pago", key: "ref", width: 18 },
    { header: "Cuenta contable", key: "cuenta" },
  ],
  rows: async (ctx, sp) => {
    const rows = await ctx.db.cuota.findMany({ where: filtroCuotas(sp), include: { concepto: true, unidad: { select: { codigo: true } } }, orderBy: [{ periodo: "desc" }, { unidad: { codigo: "asc" } }], take: 20000 });
    return rows.map((c) => ({
      unidad: c.unidad.codigo,
      periodo: c.periodo,
      concepto: c.concepto.nombre,
      descripcion: c.descripcion,
      emision: c.fechaEmision,
      vence: c.fechaVencimiento,
      valor: toNumber(c.valorBase),
      iva: toNumber(c.iva),
      descuento: toNumber(c.descuento),
      saldo: toNumber(c.saldo),
      estado: label(c.estado),
      ref: c.referenciaPago,
      cuenta: c.concepto.cuentaContable,
    }));
  },
});

registerExporter("cartera-pagos", {
  perm: "pagos.ver_todos",
  titulo: "Pagos recibidos",
  columns: [
    { header: "Recibo", key: "recibo", tipo: "numero" },
    { header: "Fecha", key: "fecha", tipo: "fecha" },
    { header: "Unidad", key: "unidad" },
    { header: "Valor", key: "valor", tipo: "moneda" },
    { header: "Medio", key: "medio" },
    { header: "Pasarela", key: "pasarela" },
    { header: "Referencia", key: "referencia", width: 20 },
    { header: "Referencia externa", key: "externa", width: 20 },
    { header: "Estado", key: "estado" },
    { header: "Conciliado", key: "conciliado" },
  ],
  rows: async (ctx, sp) => {
    const rows = await ctx.db.pago.findMany({ where: filtroPagos(sp), include: { unidad: { select: { codigo: true } } }, orderBy: { fecha: "desc" }, take: 20000 });
    return rows.map((p) => ({
      recibo: p.numeroRecibo,
      fecha: p.fecha,
      unidad: p.unidad.codigo,
      valor: toNumber(p.valor),
      medio: label(p.medio),
      pasarela: p.pasarela === "NINGUNA" ? "" : label(p.pasarela),
      referencia: p.referencia,
      externa: p.referenciaExterna,
      estado: label(p.estado),
      conciliado: p.conciliado ? "Sí" : "No",
    }));
  },
});

registerExporter("cartera-gestiones", {
  perm: "cartera.ver_todos",
  titulo: "Gestiones de cobro (Ley 2300)",
  columns: [
    { header: "Fecha", key: "fecha", tipo: "fecha" },
    { header: "Hora", key: "hora" },
    { header: "Unidad", key: "unidad" },
    { header: "Canal", key: "canal" },
    { header: "Resultado", key: "resultado", width: 36 },
    { header: "Notas", key: "notas", width: 36 },
    { header: "Registró", key: "usuario" },
  ],
  rows: async (ctx, sp) => {
    const rows = await ctx.db.gestionCobro.findMany({ where: filtroGestiones(sp), include: { unidad: { select: { codigo: true } } }, orderBy: { fecha: "desc" }, take: 20000 });
    const users = await ctx.db.usuario.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.usuarioId).filter((x): x is string => !!x))] } }, select: { id: true, nombre: true } });
    const un = new Map(users.map((u) => [u.id, u.nombre]));
    return rows.map((g) => ({
      fecha: g.fecha,
      hora: new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit" }).format(g.fecha),
      unidad: g.unidad.codigo,
      canal: label(g.canal),
      resultado: g.resultado,
      notas: g.notas,
      usuario: g.usuarioId ? (un.get(g.usuarioId) ?? "") : "Sistema",
    }));
  },
});

registerExporter("cartera-movimientos", {
  perm: "cartera.exportar",
  titulo: "Movimientos de cartera (libro auxiliar)",
  columns: [
    { header: "Fecha", key: "fecha", tipo: "fecha" },
    { header: "Unidad", key: "unidad" },
    { header: "Descripción", key: "descripcion", width: 50 },
    { header: "Concepto", key: "concepto" },
    { header: "Débito", key: "debito", tipo: "moneda" },
    { header: "Crédito", key: "credito", tipo: "moneda" },
  ],
  rows: async (ctx, sp) => {
    const rows = await ctx.db.movimientoCartera.findMany({
      where: { ...(sp.unidad ? { unidadId: sp.unidad } : {}), ...(sp.desde ? { fecha: { gte: new Date(sp.desde) } } : {}) },
      include: { unidad: { select: { codigo: true } } },
      orderBy: [{ fecha: "asc" }, { createdAt: "asc" }],
      take: 50000,
    });
    return rows.map((m) => ({
      fecha: m.fecha,
      unidad: m.unidad.codigo,
      descripcion: m.descripcion,
      concepto: m.conceptoTipo ? label(m.conceptoTipo) : "",
      debito: m.tipo === "DEBITO" ? toNumber(m.valor) : null,
      credito: m.tipo === "CREDITO" ? toNumber(m.valor) : null,
    }));
  },
});
