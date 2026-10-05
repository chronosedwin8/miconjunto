import type { Ctx } from "@/lib/auth/context";
import { audit } from "@/lib/audit";
import { AppError } from "@/lib/errors";
import { parseMoney } from "@/lib/validation";
import { parseLocal, toNumber } from "@/lib/format";
import { conjuntoConfig } from "@/lib/conjunto/config";
import { cuotaAdministracion } from "@/lib/cartera/calculos";
import { crearCargo } from "@/lib/cartera/core";
import { invitarUsuario } from "@/lib/usuarios/service";
import { validarCoeficientes } from "@/lib/conjunto/service";
import { normalizarPlaca, placaValida } from "@/lib/residentes/calculos";

export const TIPOS_IMPORTACION = {
  UNIDADES: {
    titulo: "Torres y unidades",
    plantilla: "unidades.xlsx",
    columnas: ["codigo", "torre", "tipo", "piso", "area_privada", "area_construida", "coeficiente", "cuota_administracion", "matricula", "estrato", "habitaciones", "banos", "ocupacion"],
    requeridas: ["codigo", "coeficiente"],
    ejemplo: [["T1-101", "Torre 1", "APARTAMENTO", "1", "82.5", "", "0.812345", "390000", "040-123456", "5", "3", "2", "PROPIETARIO_OCUPA"]],
  },
  PROPIETARIOS: {
    titulo: "Propietarios y residentes",
    plantilla: "propietarios.xlsx",
    columnas: ["unidad", "vinculo", "tipo_documento", "numero_documento", "nombres", "apellidos", "email", "telefono", "porcentaje", "fecha_nacimiento", "invitar"],
    requeridas: ["unidad", "numero_documento", "nombres", "apellidos"],
    ejemplo: [["T1-101", "PROPIETARIO", "CC", "72123456", "Carlos", "Pérez Díaz", "carlos@correo.com", "3001234567", "100", "1975-04-12", "SI"]],
  },
  SALDOS: {
    titulo: "Saldos iniciales (cartera de apertura)",
    plantilla: "saldos.xlsx",
    columnas: ["unidad", "concepto", "valor", "fecha_vencimiento", "periodo", "descripcion"],
    requeridas: ["unidad", "valor", "fecha_vencimiento"],
    ejemplo: [
      ["T1-101", "ADMINISTRACION", "780000", "2026-08-10", "2026-08", "Saldo de administración a la fecha de inicio"],
      ["T1-101", "INTERES_MORA", "24500", "2026-08-31", "2026-08", "Intereses acumulados a la fecha de inicio"],
    ],
  },
  VEHICULOS: {
    titulo: "Vehículos de residentes",
    plantilla: "vehiculos.xlsx",
    columnas: ["unidad", "placa", "tipo", "marca", "modelo", "color", "soat_vence", "tecnomecanica_vence", "parqueadero"],
    requeridas: ["unidad", "placa"],
    ejemplo: [
      ["T1-101", "ABC123", "CARRO", "Mazda", "CX-30", "Gris", "2027-03-15", "2027-05-20", "P-001"],
      ["T1-101", "XYZ12D", "MOTO", "Yamaha", "NMAX", "Negro", "2027-01-10", "", ""],
    ],
  },
  ZONAS: {
    titulo: "Zonas comunes",
    plantilla: "zonas.xlsx",
    columnas: ["nombre", "categoria", "capacidad", "tarifa", "deposito", "grava_iva", "genera_factura", "reservable", "requiere_aprobacion", "reglas"],
    requeridas: ["nombre"],
    ejemplo: [["Salón social", "SALON", "80", "250000", "200000", "SI", "SI", "SI", "SI", "Música hasta las 11 p. m."]],
  },
  PARQUEADEROS: {
    titulo: "Parqueaderos",
    plantilla: "parqueaderos.xlsx",
    columnas: ["codigo", "tipo", "ubicacion", "unidad"],
    requeridas: ["codigo"],
    ejemplo: [["P-001", "PRIVADO", "Sótano 1", "T1-101"]],
  },
  BODEGAS: {
    titulo: "Bodegas",
    plantilla: "bodegas.xlsx",
    columnas: ["codigo", "ubicacion", "area", "unidad"],
    requeridas: ["codigo"],
    ejemplo: [["BD-01", "Sótano 1", "4", "T1-101"]],
  },
  USUARIOS: {
    titulo: "Usuarios iniciales e invitaciones",
    plantilla: "usuarios.xlsx",
    columnas: ["email", "nombre", "rol", "unidad", "vinculo", "telefono"],
    requeridas: ["email", "rol"],
    ejemplo: [["porteria@conjunto.co", "Juan Portero", "PORTERIA", "", "", "3001112233"]],
  },
} as const;

export type TipoImportacion = keyof typeof TIPOS_IMPORTACION;
export type ErrorFila = { fila: number; campo: string; mensaje: string };

const si = (v: string | undefined) => /^(si|sí|s|x|1|true|verdadero)$/i.test((v ?? "").trim());
const up = (v: string | undefined) =>
  (v ?? "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, "_");
const num = (v: string | undefined) => {
  if (!v || !v.trim()) return null;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
};

const TIPOS_UNIDAD = ["APARTAMENTO", "CASA", "LOCAL", "OFICINA", "DEPOSITO", "PARQUEADERO"];
const OCUPACION = ["PROPIETARIO_OCUPA", "ARRENDADA", "AIRBNB_O_SIMILAR", "DESOCUPADA", "EN_VENTA"];
const VINCULOS = ["PROPIETARIO", "COPROPIETARIO", "ARRENDATARIO", "RESIDENTE", "FAMILIAR", "EMPLEADO_DOMESTICO", "CUIDADOR", "VISITANTE_FRECUENTE", "AUTORIZADO_RECOGER_PAQUETES", "AUTORIZADO_MENORES"];
const DOCS = ["CC", "CE", "TI", "RC", "PA", "NIT", "PEP", "PPT"];
const CONCEPTOS = ["ADMINISTRACION", "EXTRAORDINARIA", "MULTA", "INTERES_MORA", "ALQUILER_ZONA", "PARQUEADERO", "SERVICIO", "OTRO"];
const CATEGORIAS = ["SALON", "PISCINA", "GIMNASIO", "BBQ", "CANCHA", "JUEGOS", "TERRAZA", "SALA_JUNTAS", "COWORKING", "OTRA"];
const TIPOS_PARQ = ["PRIVADO", "COMUN", "VISITANTES", "MOTO", "BICICLETA", "DISCAPACIDAD"];
const TIPOS_VEHICULO = ["CARRO", "MOTO", "BICICLETA", "OTRO"] as const;
const fechaInvalida = (v: string | undefined) => !!v?.trim() && Number.isNaN(parseLocal(v.trim().slice(0, 10)).getTime());

/** Valida fila por fila. No escribe en la BD. */
export async function validarImportacion(ctx: Ctx, tipo: TipoImportacion, filas: Record<string, string>[]) {
  const def = TIPOS_IMPORTACION[tipo];
  const errores: ErrorFila[] = [];
  const err = (fila: number, campo: string, mensaje: string) => errores.push({ fila, campo, mensaje });
  const unidades = new Map((await ctx.db.unidad.findMany({ select: { id: true, codigo: true } })).map((u) => [u.codigo.toUpperCase(), u.id]));
  const vistos = new Set<string>();
  const placasBd =
    tipo === "VEHICULOS" ? new Map((await ctx.db.vehiculo.findMany({ select: { placa: true, unidad: { select: { codigo: true } } } })).map((v) => [v.placa, v.unidad.codigo.toUpperCase()])) : new Map<string, string>();
  const parqueaderos = tipo === "VEHICULOS" ? new Set((await ctx.db.parqueadero.findMany({ select: { codigo: true } })).map((p) => p.codigo.toUpperCase())) : new Set<string>();

  filas.forEach((f, i) => {
    const n = i + 2; // fila de Excel (1 = encabezado)
    for (const r of def.requeridas) if (!f[r]?.trim()) err(n, r, "Campo obligatorio vacío");
    switch (tipo) {
      case "UNIDADES": {
        const cod = f.codigo?.trim().toUpperCase();
        if (cod && vistos.has(cod)) err(n, "codigo", "Código repetido en el archivo");
        if (cod) vistos.add(cod);
        if (f.tipo && !TIPOS_UNIDAD.includes(up(f.tipo))) err(n, "tipo", `Tipo no válido. Use: ${TIPOS_UNIDAD.join(", ")}`);
        if (f.ocupacion && !OCUPACION.includes(up(f.ocupacion))) err(n, "ocupacion", `Ocupación no válida. Use: ${OCUPACION.join(", ")}`);
        const c = num(f.coeficiente);
        if (c !== null && (Number.isNaN(c) || c < 0 || c > 100)) err(n, "coeficiente", "Debe ser un número entre 0 y 100");
        for (const k of ["piso", "area_privada", "area_construida", "estrato", "habitaciones", "banos"]) if (Number.isNaN(num(f[k]))) err(n, k, "Debe ser un número");
        if (f.cuota_administracion && Number.isNaN(parseMoney(f.cuota_administracion))) err(n, "cuota_administracion", "Valor no válido");
        break;
      }
      case "PROPIETARIOS": {
        if (f.unidad && !unidades.has(f.unidad.trim().toUpperCase())) err(n, "unidad", `La unidad ${f.unidad} no existe (impórtela primero)`);
        if (f.vinculo && !VINCULOS.includes(up(f.vinculo))) err(n, "vinculo", `Vínculo no válido. Use: ${VINCULOS.slice(0, 5).join(", ")}…`);
        if (f.tipo_documento && !DOCS.includes(up(f.tipo_documento))) err(n, "tipo_documento", `Use: ${DOCS.join(", ")}`);
        if (f.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email.trim())) err(n, "email", "Correo no válido");
        if (f.fecha_nacimiento && Number.isNaN(parseLocal(f.fecha_nacimiento.slice(0, 10)).getTime())) err(n, "fecha_nacimiento", "Fecha no válida (AAAA-MM-DD)");
        const p = num(f.porcentaje);
        if (p !== null && (Number.isNaN(p) || p <= 0 || p > 100)) err(n, "porcentaje", "Entre 0 y 100");
        break;
      }
      case "SALDOS": {
        if (f.unidad && !unidades.has(f.unidad.trim().toUpperCase())) err(n, "unidad", `La unidad ${f.unidad} no existe`);
        if (f.concepto && !CONCEPTOS.includes(up(f.concepto))) err(n, "concepto", `Concepto no válido. Use: ${CONCEPTOS.join(", ")}`);
        const v = parseMoney(f.valor);
        if (f.valor && (Number.isNaN(v) || v <= 0)) err(n, "valor", "Debe ser un valor mayor a cero");
        if (f.fecha_vencimiento && Number.isNaN(parseLocal(f.fecha_vencimiento.slice(0, 10)).getTime())) err(n, "fecha_vencimiento", "Fecha no válida (AAAA-MM-DD)");
        if (f.periodo && !/^\d{4}-\d{2}$/.test(f.periodo.trim())) err(n, "periodo", "Formato AAAA-MM");
        break;
      }
      case "VEHICULOS": {
        const unidad = f.unidad?.trim().toUpperCase();
        if (unidad && !unidades.has(unidad)) err(n, "unidad", `La unidad ${f.unidad} no existe (impórtela primero)`);
        const tipoV = f.tipo ? up(f.tipo) : "CARRO";
        if (f.tipo && !(TIPOS_VEHICULO as readonly string[]).includes(tipoV)) err(n, "tipo", `Tipo no válido. Use: ${TIPOS_VEHICULO.join(", ")}`);
        if (f.placa?.trim()) {
          const placa = normalizarPlaca(f.placa);
          if ((TIPOS_VEHICULO as readonly string[]).includes(tipoV) && !placaValida(placa, tipoV as (typeof TIPOS_VEHICULO)[number]))
            err(n, "placa", tipoV === "MOTO" ? "Placa de moto no válida (ej. ABC12D)" : tipoV === "CARRO" ? "Placa de carro no válida (ej. ABC123)" : "Placa no válida");
          if (vistos.has(placa)) err(n, "placa", "Placa repetida en el archivo");
          vistos.add(placa);
          const enBd = placasBd.get(placa);
          if (enBd && unidad && enBd !== unidad) err(n, "placa", `La placa ya está registrada en ${enBd}`);
        }
        if (fechaInvalida(f.soat_vence)) err(n, "soat_vence", "Fecha no válida (AAAA-MM-DD)");
        if (fechaInvalida(f.tecnomecanica_vence)) err(n, "tecnomecanica_vence", "Fecha no válida (AAAA-MM-DD)");
        if (f.parqueadero?.trim() && !parqueaderos.has(f.parqueadero.trim().toUpperCase())) err(n, "parqueadero", `El parqueadero ${f.parqueadero} no existe (impórtelo primero)`);
        break;
      }
      case "ZONAS": {
        if (f.categoria && !CATEGORIAS.includes(up(f.categoria))) err(n, "categoria", `Use: ${CATEGORIAS.join(", ")}`);
        if (f.tarifa && Number.isNaN(parseMoney(f.tarifa))) err(n, "tarifa", "Valor no válido");
        break;
      }
      case "PARQUEADEROS":
      case "BODEGAS": {
        if (f.unidad && !unidades.has(f.unidad.trim().toUpperCase())) err(n, "unidad", `La unidad ${f.unidad} no existe`);
        if (tipo === "PARQUEADEROS" && f.tipo && !TIPOS_PARQ.includes(up(f.tipo))) err(n, "tipo", `Use: ${TIPOS_PARQ.join(", ")}`);
        const cod = f.codigo?.trim().toUpperCase();
        if (cod && vistos.has(cod)) err(n, "codigo", "Código repetido en el archivo");
        if (cod) vistos.add(cod);
        break;
      }
      case "USUARIOS": {
        if (f.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email.trim())) err(n, "email", "Correo no válido");
        if (f.unidad && !unidades.has(f.unidad.trim().toUpperCase())) err(n, "unidad", `La unidad ${f.unidad} no existe`);
        break;
      }
    }
  });

  if (tipo === "USUARIOS") {
    const roles = new Set((await ctx.db.rol.findMany({ select: { clave: true } })).map((r) => r.clave));
    filas.forEach((f, i) => f.rol && !roles.has(up(f.rol)) && err(i + 2, "rol", `Rol no válido. Use: ${[...roles].join(", ")}`));
  }
  const filasConError = new Set(errores.map((e) => e.fila));
  let advertencia: string | null = null;
  if (tipo === "UNIDADES") {
    const v = validarCoeficientes(filas.map((f) => num(f.coeficiente) ?? 0).filter((x) => !Number.isNaN(x)));
    if (!v.ok) advertencia = `Los coeficientes del archivo suman ${v.suma} % (deberían sumar 100 %).`;
  }
  return { errores, filasOk: filas.length - filasConError.size, filasConError: filasConError.size, advertencia };
}

/** Crea el registro de importación con las filas y el resultado de validación. */
export async function prepararImportacion(ctx: Ctx, tipo: TipoImportacion, archivoNombre: string, filas: Record<string, string>[]) {
  if (!filas.length) throw new AppError("El archivo no tiene filas con datos.");
  if (filas.length > 5000) throw new AppError("Máximo 5.000 filas por archivo.");
  const v = await validarImportacion(ctx, tipo, filas);
  const imp = await ctx.db.importacionApertura.create({
    data: {
      conjuntoId: ctx.conjuntoId,
      tipo,
      archivoNombre,
      estado: v.errores.length ? "CON_ERRORES" : "VALIDANDO",
      totalFilas: filas.length,
      filasOk: v.filasOk,
      filasError: v.filasConError,
      errores: v.errores,
      resumen: { filas, advertencia: v.advertencia },
      creadoPorId: ctx.userId,
    },
  });
  return { id: imp.id, ...v };
}

/** Aplica las filas válidas de una importación ya validada. Idempotente por código/documento. */
export async function aplicarImportacion(ctx: Ctx, importacionId: string) {
  const imp = await ctx.db.importacionApertura.findUnique({ where: { id: importacionId } });
  if (!imp) throw new AppError("La importación no existe.");
  if (imp.estado === "APLICADA") throw new AppError("Esta importación ya fue aplicada.");
  const filas = ((imp.resumen as { filas: Record<string, string>[] })?.filas ?? []) as Record<string, string>[];
  const conError = new Set(((imp.errores as ErrorFila[]) ?? []).map((e) => e.fila));
  const validas = filas.map((f, i) => ({ f, fila: i + 2 })).filter((x) => !conError.has(x.fila));
  const cfg = conjuntoConfig(ctx);
  const unidadId = async (codigo?: string) => (codigo ? (await ctx.db.unidad.findFirst({ where: { codigo: { equals: codigo.trim(), mode: "insensitive" } } }))?.id ?? null : null);
  let creados = 0;
  let actualizados = 0;
  const fallos: ErrorFila[] = [];

  for (const { f, fila } of validas) {
    try {
      switch (imp.tipo as TipoImportacion) {
        case "UNIDADES": {
          let torreId: string | null = null;
          if (f.torre?.trim()) {
            const t = await ctx.db.torre.findFirst({ where: { nombre: f.torre.trim() } });
            torreId = t?.id ?? (await ctx.db.torre.create({ data: { conjuntoId: ctx.conjuntoId, nombre: f.torre.trim(), pisos: Number(f.piso) || 1 } })).id;
          }
          const coef = num(f.coeficiente) ?? 0;
          const cuota = f.cuota_administracion ? parseMoney(f.cuota_administracion) : cuotaAdministracion({ modo: cfg.cartera.calculoCuota, presupuestoMensual: cfg.cartera.presupuestoMensual, coeficiente: coef, valorFijo: 0 });
          const data = {
            torreId,
            tipo: (f.tipo ? up(f.tipo) : torreId ? "APARTAMENTO" : "CASA") as never,
            piso: num(f.piso),
            areaPrivada: num(f.area_privada),
            areaConstruida: num(f.area_construida),
            coeficiente: coef,
            cuotaAdministracion: cuota,
            matriculaInmobiliaria: f.matricula || null,
            estrato: num(f.estrato),
            habitaciones: num(f.habitaciones),
            banos: num(f.banos),
            estadoOcupacion: (f.ocupacion ? up(f.ocupacion) : "PROPIETARIO_OCUPA") as never,
          };
          const ex = await ctx.db.unidad.findFirst({ where: { codigo: f.codigo.trim() } });
          if (ex) {
            await ctx.db.unidad.update({ where: { id: ex.id }, data });
            if (toNumber(ex.coeficiente) !== coef) await ctx.db.historialCoeficiente.create({ data: { conjuntoId: ctx.conjuntoId, unidadId: ex.id, anterior: ex.coeficiente, nuevo: coef, motivo: `Importación ${imp.archivoNombre}`, usuarioId: ctx.userId } });
            actualizados++;
          } else {
            await ctx.db.unidad.create({ data: { ...data, conjuntoId: ctx.conjuntoId, codigo: f.codigo.trim() } });
            creados++;
          }
          break;
        }
        case "PROPIETARIOS": {
          const uid = (await unidadId(f.unidad))!;
          const tipoDocumento = (f.tipo_documento ? up(f.tipo_documento) : "CC") as never;
          let p = await ctx.db.persona.findFirst({ where: { tipoDocumento, numeroDocumento: f.numero_documento.trim() } });
          const pdata = {
            nombres: f.nombres.trim(),
            apellidos: f.apellidos.trim(),
            email: f.email?.trim().toLowerCase() || null,
            telefono: f.telefono?.trim() || null,
            fechaNacimiento: f.fecha_nacimiento ? parseLocal(f.fecha_nacimiento.slice(0, 10)) : null,
          };
          if (p) {
            p = await ctx.db.persona.update({ where: { id: p.id }, data: pdata });
            actualizados++;
          } else {
            p = await ctx.db.persona.create({ data: { ...pdata, conjuntoId: ctx.conjuntoId, tipoDocumento, numeroDocumento: f.numero_documento.trim() } });
            creados++;
          }
          const vinc = (f.vinculo ? up(f.vinculo) : "PROPIETARIO") as never;
          const ex = await ctx.db.vinculoUnidad.findFirst({ where: { personaId: p.id, unidadId: uid } });
          if (!ex) {
            const principal = !(await ctx.db.vinculoUnidad.findFirst({ where: { unidadId: uid, principal: true } }));
            await ctx.db.vinculoUnidad.create({ data: { conjuntoId: ctx.conjuntoId, personaId: p.id, unidadId: uid, tipo: vinc, porcentajePropiedad: num(f.porcentaje), principal: principal && vinc === "PROPIETARIO" } });
          }
          if (si(f.invitar) && p.email) {
            const rol = vinc === "ARRENDATARIO" || vinc === "RESIDENTE" ? "RESIDENTE" : vinc === "FAMILIAR" ? "CONVIVIENTE" : "PROPIETARIO";
            await invitarUsuario(ctx, { email: p.email, nombre: `${p.nombres} ${p.apellidos}`, rolClave: rol, unidadId: uid, tipoVinculo: vinc, personaId: p.id, telefono: p.telefono }).catch(() => undefined);
          }
          break;
        }
        case "SALDOS": {
          const uid = (await unidadId(f.unidad))!;
          const venc = parseLocal(f.fecha_vencimiento.slice(0, 10));
          await crearCargo(ctx, {
            unidadId: uid,
            conceptoTipo: (f.concepto ? up(f.concepto) : "ADMINISTRACION") as never,
            valorBase: parseMoney(f.valor),
            fechaEmision: venc,
            fechaVencimiento: venc,
            periodo: f.periodo?.trim() || `${venc.getFullYear()}-${String(venc.getMonth() + 1).padStart(2, "0")}`,
            descripcion: f.descripcion?.trim() || "Saldo inicial de apertura",
            origen: "APERTURA",
          });
          creados++;
          break;
        }
        case "VEHICULOS": {
          const uid = (await unidadId(f.unidad))!;
          const placa = normalizarPlaca(f.placa);
          const fecha = (v?: string) => (v?.trim() ? parseLocal(v.trim().slice(0, 10)) : null);
          const parq = f.parqueadero?.trim() ? await ctx.db.parqueadero.findFirst({ where: { codigo: { equals: f.parqueadero.trim(), mode: "insensitive" } } }) : null;
          const data = {
            unidadId: uid,
            tipo: (f.tipo ? up(f.tipo) : "CARRO") as never,
            marca: f.marca?.trim() || null,
            modelo: f.modelo?.trim() || null,
            color: f.color?.trim() || null,
            soatVence: fecha(f.soat_vence),
            tecnomecanicaVence: fecha(f.tecnomecanica_vence),
            parqueaderoId: parq?.id ?? null,
            activo: true,
          };
          // La placa es única por conjunto (incluye registros borrados, que se reactivan).
          const ex = await ctx.db.vehiculo.findFirst({ where: { placa, deletedAt: undefined } });
          if (ex) {
            await ctx.db.vehiculo.update({ where: { id: ex.id }, data: { ...data, deletedAt: null } });
            actualizados++;
          } else {
            await ctx.db.vehiculo.create({ data: { ...data, conjuntoId: ctx.conjuntoId, placa } });
            creados++;
          }
          break;
        }
        case "ZONAS": {
          const tarifa = f.tarifa ? parseMoney(f.tarifa) : 0;
          const data = {
            nombre: f.nombre.trim(),
            categoria: (f.categoria ? up(f.categoria) : "OTRA") as never,
            capacidad: num(f.capacidad),
            tarifa,
            deposito: f.deposito ? parseMoney(f.deposito) : 0,
            gravaIva: tarifa > 0 && si(f.grava_iva),
            generaFactura: tarifa > 0 && si(f.genera_factura),
            reservable: f.reservable ? si(f.reservable) : true,
            requiereAprobacion: si(f.requiere_aprobacion),
            reglasUso: f.reglas || null,
          };
          const ex = await ctx.db.zonaComun.findFirst({ where: { nombre: data.nombre } });
          if (ex) {
            await ctx.db.zonaComun.update({ where: { id: ex.id }, data });
            actualizados++;
          } else {
            await ctx.db.zonaComun.create({ data: { ...data, conjuntoId: ctx.conjuntoId } });
            creados++;
          }
          break;
        }
        case "PARQUEADEROS": {
          const uid = await unidadId(f.unidad);
          const data = { tipo: (f.tipo ? up(f.tipo) : "PRIVADO") as never, ubicacion: f.ubicacion || null, unidadId: uid, estado: (uid ? "ASIGNADO" : "DISPONIBLE") as never };
          const ex = await ctx.db.parqueadero.findFirst({ where: { codigo: f.codigo.trim() } });
          if (ex) {
            await ctx.db.parqueadero.update({ where: { id: ex.id }, data });
            actualizados++;
          } else {
            await ctx.db.parqueadero.create({ data: { ...data, conjuntoId: ctx.conjuntoId, codigo: f.codigo.trim() } });
            creados++;
          }
          break;
        }
        case "BODEGAS": {
          const uid = await unidadId(f.unidad);
          const data = { ubicacion: f.ubicacion || null, area: num(f.area), unidadId: uid, estado: (uid ? "ASIGNADO" : "DISPONIBLE") as never };
          const ex = await ctx.db.bodega.findFirst({ where: { codigo: f.codigo.trim() } });
          if (ex) {
            await ctx.db.bodega.update({ where: { id: ex.id }, data });
            actualizados++;
          } else {
            await ctx.db.bodega.create({ data: { ...data, conjuntoId: ctx.conjuntoId, codigo: f.codigo.trim() } });
            creados++;
          }
          break;
        }
        case "USUARIOS": {
          await invitarUsuario(ctx, {
            email: f.email.trim(),
            nombre: f.nombre || null,
            rolClave: up(f.rol),
            unidadId: await unidadId(f.unidad),
            tipoVinculo: f.vinculo ? (up(f.vinculo) as never) : null,
            telefono: f.telefono || null,
          });
          creados++;
          break;
        }
      }
    } catch (e) {
      fallos.push({ fila, campo: "-", mensaje: (e as Error).message.slice(0, 200) });
    }
  }
  const errores = [...((imp.errores as ErrorFila[]) ?? []), ...fallos];
  await ctx.db.importacionApertura.update({
    where: { id: imp.id },
    data: { estado: fallos.length === validas.length && validas.length > 0 ? "FALLIDA" : "APLICADA", errores, filasError: new Set(errores.map((e) => e.fila)).size, resumen: { ...(imp.resumen as object), creados, actualizados } },
  });
  await audit(ctx, "aplicar_importacion", "ImportacionApertura", imp.id, undefined, { tipo: imp.tipo, creados, actualizados, fallos: fallos.length });
  return { creados, actualizados, fallos: fallos.length };
}
