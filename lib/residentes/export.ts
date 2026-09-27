import { registerExporter } from "@/lib/export/registry";
import { can } from "@/lib/permisos";
import { edad, nombreCompleto } from "@/lib/format";
import { label } from "@/lib/labels";
import { insensitive } from "@/lib/pagination";
import { listaEvacuacion } from "@/lib/emergencias/service";
import { wherePersonas } from "./service";
import { describirHorario, normalizarPlaca } from "./calculos";

registerExporter("residentes", {
  perm: "residentes.exportar",
  titulo: "Residentes y ocupantes",
  columns: [
    { header: "Nombre", key: "nombre", width: 30 },
    { header: "Documento", key: "documento", width: 18 },
    { header: "Unidad", key: "unidad" },
    { header: "Vínculo", key: "vinculo", width: 22 },
    { header: "Estado", key: "estado", width: 20 },
    { header: "Edad", key: "edad", tipo: "numero" },
    { header: "Teléfono", key: "telefono", width: 16 },
    { header: "Correo", key: "email", width: 28 },
    { header: "Movilidad reducida", key: "movilidad", width: 18 },
    { header: "Horario", key: "horario", width: 24 },
    { header: "Con cuenta", key: "cuenta" },
  ],
  rows: async (ctx, sp) => {
    const verTel = can(ctx, "campos.persona_telefono");
    const verDoc = can(ctx, "campos.persona_documento");
    const verSalud = can(ctx, "campos.persona_salud");
    const personas = await ctx.db.persona.findMany({
      where: wherePersonas({ q: sp.q, torre: sp.torre, tipo: sp.tipo, estado: sp.estado, grupo: sp.grupo }),
      include: { vinculos: { where: { deletedAt: null, ...(sp.estado ? { estado: sp.estado as never } : { estado: { in: ["ACTIVO", "PENDIENTE_APROBACION"] } }), ...(sp.tipo ? { tipo: sp.tipo as never } : {}) }, include: { unidad: { select: { codigo: true } } } } },
      orderBy: [{ apellidos: "asc" }, { nombres: "asc" }],
      take: 5000,
    });
    return personas.flatMap((p) =>
      p.vinculos.map((v) => ({
        nombre: nombreCompleto(p),
        documento: verDoc ? `${p.tipoDocumento} ${p.numeroDocumento}` : p.tipoDocumento,
        unidad: v.unidad.codigo,
        vinculo: label(v.tipo),
        estado: label(v.estado),
        edad: edad(p.fechaNacimiento),
        telefono: verTel ? p.telefono : "",
        email: verTel ? p.email : "",
        movilidad: verSalud ? (p.movilidadReducida ? "Sí" : "No") : "",
        horario: v.horarioPermitido ? describirHorario(v.horarioPermitido) : "",
        cuenta: p.usuarioId ? "Sí" : "No",
      })),
    );
  },
});

registerExporter("vehiculos", {
  perm: "vehiculos.ver_todos",
  titulo: "Vehículos registrados",
  columns: [
    { header: "Placa", key: "placa" },
    { header: "Tipo", key: "tipo" },
    { header: "Unidad", key: "unidad" },
    { header: "Marca", key: "marca" },
    { header: "Modelo", key: "modelo" },
    { header: "Color", key: "color" },
    { header: "Parqueadero", key: "parqueadero" },
    { header: "SOAT vence", key: "soat", tipo: "fecha" },
    { header: "Tecnomecánica vence", key: "tecno", tipo: "fecha", width: 20 },
  ],
  rows: async (ctx, sp) => {
    const rows = await ctx.db.vehiculo.findMany({
      where: { activo: true, ...(sp.q ? { OR: [{ placa: insensitive(normalizarPlaca(sp.q) || sp.q) }, { unidad: { codigo: insensitive(sp.q) } }] } : {}), ...(sp.tipo ? { tipo: sp.tipo as never } : {}) },
      include: { unidad: { select: { codigo: true } }, parqueadero: { select: { codigo: true } } },
      orderBy: { placa: "asc" },
    });
    return rows.map((v) => ({ placa: v.placa, tipo: label(v.tipo), unidad: v.unidad.codigo, marca: v.marca, modelo: v.modelo, color: v.color, parqueadero: v.parqueadero?.codigo ?? "", soat: v.soatVence, tecno: v.tecnomecanicaVence }));
  },
});

registerExporter("mascotas", {
  perm: "vehiculos.ver_todos",
  titulo: "Mascotas registradas",
  columns: [
    { header: "Nombre", key: "nombre" },
    { header: "Especie", key: "especie" },
    { header: "Raza", key: "raza" },
    { header: "Unidad", key: "unidad" },
    { header: "Antirrábica vence", key: "vacuna", tipo: "fecha", width: 18 },
    { header: "Potencialmente peligrosa", key: "peligrosa", width: 22 },
    { header: "Póliza", key: "poliza" },
    { header: "Microchip", key: "microchip", width: 18 },
  ],
  rows: async (ctx, sp) => {
    const rows = await ctx.db.mascota.findMany({
      where: { activo: true, ...(sp.q ? { OR: [{ nombre: insensitive(sp.q) }, { unidad: { codigo: insensitive(sp.q) } }] } : {}), ...(sp.especie ? { especie: sp.especie } : {}) },
      include: { unidad: { select: { codigo: true } } },
      orderBy: { nombre: "asc" },
    });
    return rows.map((m) => ({ nombre: m.nombre, especie: m.especie, raza: m.raza, unidad: m.unidad.codigo, vacuna: m.antirrabicaVence, peligrosa: m.potencialmentePeligrosa ? "Sí" : "No", poliza: m.polizaUrl ? "Sí" : m.potencialmentePeligrosa ? "Falta" : "", microchip: m.microchip }));
  },
});

registerExporter("evacuacion", {
  perm: ["emergencias.lista_evacuacion", "campos.persona_salud"],
  titulo: "Lista de evacuación asistida",
  columns: [
    { header: "Torre", key: "torre" },
    { header: "Piso", key: "piso", tipo: "numero" },
    { header: "Unidad", key: "unidad" },
    { header: "Persona", key: "nombre", width: 28 },
    { header: "Edad", key: "edad", tipo: "numero" },
    { header: "Condición", key: "descripcion", width: 36 },
    { header: "Teléfono", key: "telefono", width: 16 },
    { header: "Contacto de emergencia", key: "contacto", width: 30 },
  ],
  rows: async (ctx) => {
    const filas = await listaEvacuacion(ctx);
    return filas.map((f) => ({ torre: f.torre, piso: f.piso, unidad: f.unidad, nombre: f.nombre, edad: f.edad, descripcion: f.descripcion, telefono: f.telefono, contacto: f.contactoEmergencia }));
  },
});
