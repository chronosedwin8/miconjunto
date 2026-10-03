/**
 * Acceso derivado (puro, seguro para el cliente).
 *
 * El titular de una unidad (propietario, copropietario, arrendatario o el vínculo marcado como principal) puede dar
 * acceso a la app a las personas de su hogar. Cada acceso derivado lleva una lista de "capacidades del hogar"; cada
 * capacidad equivale a un conjunto de permisos del catálogo. El permiso efectivo de un miembro derivado es
 * `permisos de su rol ∩ permisos de sus capacidades` (más los de emergencias, que nunca se quitan).
 *
 * Nunca se otorgan por derivación: votar en asambleas/votaciones (Ley 675: solo propietarios o apoderados),
 * invitar a otras personas o gestionar residentes, administrar cartera ni ningún permiso `*.ver_todos`.
 */
import type { PermKey } from "@/lib/permisos/catalog";

export type CapacidadDef = {
  label: string;
  /** Explicación en lenguaje sencillo para el titular. */
  descripcion: string;
  /** Nombre de ícono lucide (ver UI). */
  icon: string;
  permisos: PermKey[];
  /** Permisos que el titular debe tener para poder otorgarla. */
  requiere: PermKey[];
  /** Solo la otorga quien puede ver la cuenta de la unidad (propietario o autorizado). */
  requiereCuenta?: boolean;
};

export const CAPACIDADES = {
  comunidad: {
    label: "Comunidad",
    descripcion: "Ver el muro, encuestas, calendario, documentos, clasificados y objetos perdidos.",
    icon: "megaphone",
    permisos: [
      "conjunto.ver",
      "zonas.ver",
      "comunicaciones.ver",
      "comunicaciones.comentar",
      "encuestas.ver",
      "calendario.ver",
      "documentos.ver",
      "clasificados.ver",
      "clasificados.publicar",
      "objetos.ver",
      "objetos.reportar",
      "directorio.ver",
      "directorio.proveedores",
      "directorio.calificar",
      "votaciones.ver",
      "asambleas.ver",
      "ia.usar",
    ],
    requiere: ["comunicaciones.ver"],
  },
  visitantes: {
    label: "Visitantes",
    descripcion: "Autorizar visitantes y responder cuando portería pregunte por alguien que llegó.",
    icon: "user-check",
    permisos: ["visitantes.autorizar"],
    requiere: ["visitantes.autorizar"],
  },
  paquetes: {
    label: "Paquetes",
    descripcion: "Recibir el aviso cuando llega un paquete y ver los pendientes por reclamar.",
    icon: "package",
    permisos: ["paqueteria.ver"],
    requiere: ["paqueteria.ver"],
  },
  reservas: {
    label: "Reservas",
    descripcion: "Reservar zonas comunes (BBQ, salón social…) a nombre del hogar.",
    icon: "calendar-check",
    permisos: ["reservas.ver", "reservas.crear"],
    requiere: ["reservas.crear"],
  },
  pqrs: {
    label: "PQRS y daños",
    descripcion: "Reportar daños, hacer solicitudes y ver los llamados de convivencia del hogar.",
    icon: "life-buoy",
    permisos: ["tickets.ver", "tickets.crear", "convivencia.ver"],
    requiere: ["tickets.crear"],
  },
  obras: {
    label: "Obras y mudanzas",
    descripcion: "Pedir permiso para obras, remodelaciones y mudanzas.",
    icon: "hammer",
    permisos: ["obras.ver", "obras.solicitar"],
    requiere: ["obras.solicitar"],
  },
  vehiculos: {
    label: "Vehículos y mascotas",
    descripcion: "Registrar y actualizar los vehículos y mascotas del hogar.",
    icon: "car",
    permisos: ["vehiculos.ver", "vehiculos.crear", "vehiculos.editar", "vehiculos.eliminar"],
    requiere: ["vehiculos.crear"],
  },
  hogar: {
    label: "Ficha del hogar",
    descripcion: "Ver Mi hogar: la ficha de la unidad y quiénes viven en ella.",
    icon: "house",
    permisos: ["residentes.ver", "estadisticas.personal"],
    requiere: ["residentes.ver"],
  },
  cuenta: {
    label: "Cuenta y pagos",
    descripcion: "Ver el estado de cuenta, pagar la administración y pedir el paz y salvo.",
    icon: "wallet",
    permisos: ["cartera.ver", "pagos.ver", "pagos.pagar", "paz_y_salvo.solicitar", "facturacion.ver"],
    requiere: [],
    requiereCuenta: true,
  },
} satisfies Record<string, CapacidadDef>;

export type CapacidadKey = keyof typeof CAPACIDADES;
export const CAPACIDAD_KEYS = Object.keys(CAPACIDADES) as CapacidadKey[];

/** Permisos que todo miembro con acceso activo conserva siempre (seguridad de las personas). */
export const PERMISOS_SIEMPRE: PermKey[] = ["emergencias.panico", "emergencias.ver"];

/** Permisos que la capacidad `cuenta` concede aunque el rol no los tenga (los autorizó el titular, como `puedeVerCuenta`). */
export const PERMISOS_CUENTA: PermKey[] = CAPACIDADES.cuenta.permisos;

/** ¿El permiso está prohibido para el acceso derivado? (votar, invitar, administrar, ver todo…). */
export function nuncaDerivable(perm: string): boolean {
  const [modulo, accion] = perm.split(".");
  if (accion === "ver_todos") return true;
  if (modulo === "votaciones") return accion !== "ver";
  if (modulo === "asambleas") return accion !== "ver";
  if (modulo === "consejo") return true;
  if (modulo === "residentes") return accion !== "ver";
  if (modulo === "cartera") return accion !== "ver";
  if (modulo === "pagos") return !["ver", "pagar"].includes(accion);
  if (modulo === "objetos") return accion === "gestionar";
  return [
    "configuracion",
    "auditoria",
    "porteria",
    "presupuesto",
    "proveedores",
    "empleados",
    "mantenimiento",
    "activos",
    "informes",
    "campos",
    "secciones",
  ].includes(modulo);
}

export function esCapacidad(v: unknown): v is CapacidadKey {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(CAPACIDADES, v);
}

/** Filtra valores desconocidos, quita duplicados y ordena según el catálogo. */
export function normalizarCapacidades(caps: readonly unknown[] | null | undefined): CapacidadKey[] {
  const set = new Set((caps ?? []).filter(esCapacidad));
  return CAPACIDAD_KEYS.filter((k) => set.has(k));
}

/** Unión de permisos de las capacidades (sin los de siempre). */
export function permisosDeCapacidades(caps: readonly string[]): Set<PermKey> {
  const out = new Set<PermKey>();
  for (const c of normalizarCapacidades(caps)) for (const p of CAPACIDADES[c].permisos) out.add(p);
  return out;
}

/** Techo de quien otorga: sus permisos efectivos y si puede ver la cuenta de la unidad. */
export type Techo = { permisos: ReadonlySet<string>; tieneCuenta: boolean; esSuperAdmin?: boolean };

/** Capacidades que puede otorgar un titular (nunca más de lo que él mismo tiene). */
export function capacidadesOtorgables(techo: Techo): CapacidadKey[] {
  return CAPACIDAD_KEYS.filter((k) => {
    const def: CapacidadDef = CAPACIDADES[k];
    if (def.requiereCuenta && !techo.tieneCuenta) return false;
    if (techo.esSuperAdmin) return true;
    return def.requiere.every((p) => techo.permisos.has(p));
  });
}

/** Capacidades pedidas que exceden el techo de quien otorga. */
export function excedentes(caps: readonly string[], techo: Techo): CapacidadKey[] {
  const ok = new Set(capacidadesOtorgables(techo));
  return normalizarCapacidades(caps).filter((c) => !ok.has(c));
}

// ─────────────────────────── Presets ───────────────────────────

export type TipoDerivado = "FAMILIAR" | "RESIDENTE" | "EMPLEADO_DOMESTICO" | "CUIDADOR" | "ARRENDATARIO";

export const PRESETS = {
  FAMILIAR_ADULTO: {
    label: "Familiar adulto",
    descripcion: "Pareja, hijos mayores o padres que viven contigo",
    tipoVinculo: "FAMILIAR",
    capacidades: ["comunidad", "visitantes", "paquetes", "reservas", "pqrs", "obras", "vehiculos", "hogar", "cuenta"],
  },
  MENOR: {
    label: "Menor o adolescente",
    descripcion: "Hijos menores de 18 años",
    tipoVinculo: "FAMILIAR",
    capacidades: ["comunidad", "reservas", "paquetes"],
  },
  EMPLEADA: {
    label: "Empleada doméstica",
    descripcion: "Solo visitantes y paquetes",
    tipoVinculo: "EMPLEADO_DOMESTICO",
    capacidades: ["visitantes", "paquetes"],
  },
  CUIDADOR: {
    label: "Cuidador(a)",
    descripcion: "Visitantes, paquetes y la ficha del hogar",
    tipoVinculo: "CUIDADOR",
    capacidades: ["visitantes", "paquetes", "hogar"],
  },
  ARRENDATARIO: {
    label: "Arrendatario",
    descripcion: "Vive en arriendo en tu unidad; lo aprueba la administración",
    tipoVinculo: "ARRENDATARIO",
    capacidades: ["comunidad", "visitantes", "paquetes", "reservas", "pqrs", "obras", "vehiculos", "hogar"],
  },
  OTRO: {
    label: "Otro residente",
    descripcion: "Alguien más que vive en el hogar",
    tipoVinculo: "RESIDENTE",
    capacidades: ["comunidad", "visitantes", "paquetes", "reservas", "pqrs"],
  },
} as const satisfies Record<string, { label: string; descripcion: string; tipoVinculo: TipoDerivado; capacidades: CapacidadKey[] }>;

export type PresetKey = keyof typeof PRESETS;
export const PRESET_KEYS = Object.keys(PRESETS) as PresetKey[];
export const TIPOS_DERIVADOS: TipoDerivado[] = ["FAMILIAR", "RESIDENTE", "EMPLEADO_DOMESTICO", "CUIDADOR", "ARRENDATARIO"];

/** Preset sugerido para un tipo de vínculo (para "Ajustar permisos" de alguien que ya vive en la unidad). */
export function presetPara(tipo: string, menorDeEdad = false): PresetKey {
  if (tipo === "FAMILIAR") return menorDeEdad ? "MENOR" : "FAMILIAR_ADULTO";
  if (tipo === "EMPLEADO_DOMESTICO") return "EMPLEADA";
  if (tipo === "CUIDADOR") return "CUIDADOR";
  if (tipo === "ARRENDATARIO") return "ARRENDATARIO";
  return "OTRO";
}

// ─────────────────────────── Titulares ───────────────────────────

export const TIPOS_TITULAR = ["PROPIETARIO", "COPROPIETARIO", "ARRENDATARIO"] as const;

/**
 * Titular de la unidad = vínculo activo y no pausado que sea propietario, copropietario o arrendatario
 * (el arrendatario es la cabeza del hogar que habita la unidad arrendada), o el vínculo marcado como principal
 * siempre que no sea derivado (un acceso derivado no se vuelve titular por marcarse principal).
 */
export function esVinculoTitular(v: { tipo: string; principal: boolean; estado: string; accesoPausado: boolean; derivadoDeId: string | null }) {
  if (v.estado !== "ACTIVO" || v.accesoPausado) return false;
  if ((TIPOS_TITULAR as readonly string[]).includes(v.tipo)) return true;
  return v.principal && !v.derivadoDeId;
}

/** Grupo del titular: los propietarios gestionan lo que otorgaron ellos; los ocupantes (arrendatario) lo suyo. */
export function grupoTitular(tipo: string): "PROPIETARIOS" | "OCUPANTES" {
  return tipo === "PROPIETARIO" || tipo === "COPROPIETARIO" ? "PROPIETARIOS" : "OCUPANTES";
}

export function esDerivado(v: { derivadoDeId: string | null; capacidadesHogar: readonly string[] }) {
  return !!v.derivadoDeId || v.capacidadesHogar.length > 0;
}

// ─────────────────────────── Resolución del contexto ───────────────────────────

export type VinculoCtx = {
  unidadId: string;
  personaId: string;
  tipo: string;
  derivadoDeId: string | null;
  capacidadesHogar: string[];
  accesoPausado: boolean;
  /** Vínculo del titular que otorgó el acceso (si se pausó o terminó, este acceso tampoco vale). */
  derivadoDe?: { estado: string; accesoPausado: boolean; deletedAt?: Date | null } | null;
};

export type AccesoResuelto = {
  permisos: Set<string>;
  unidadIds: string[];
  unidadesPropias: string[];
  personaIds: string[];
  /** El usuario entra solo con acceso derivado (sus permisos están restringidos por capacidades). */
  accesoDerivado: boolean;
};

function vigente(v: VinculoCtx) {
  if (v.accesoPausado) return false;
  if (v.derivadoDeId && v.derivadoDe && (v.derivadoDe.estado !== "ACTIVO" || v.derivadoDe.accesoPausado || v.derivadoDe.deletedAt)) return false;
  return true;
}

/**
 * Núcleo de `buildCtx`: a partir de los vínculos ACTIVOS del usuario calcula unidades y permisos efectivos.
 * - Los vínculos pausados (o cuyo titular ya no está activo) no cuentan como unidades del usuario.
 * - Si el rol es residencial y TODOS sus vínculos vigentes son derivados, los permisos se restringen a
 *   `rol ∩ capacidades` (+ emergencias, + cuenta si se la otorgaron). Si tiene algún vínculo propio no derivado,
 *   conserva los permisos de su rol.
 */
export function resolverAcceso(input: { rolResidencial: boolean; permisosRol: ReadonlySet<string>; vinculos: VinculoCtx[] }): AccesoResuelto {
  const vigentes = input.vinculos.filter(vigente);
  const base = {
    unidadIds: [...new Set(vigentes.map((v) => v.unidadId))],
    unidadesPropias: [...new Set(vigentes.filter((v) => v.tipo === "PROPIETARIO" || v.tipo === "COPROPIETARIO").map((v) => v.unidadId))],
    personaIds: [...new Set(input.vinculos.map((v) => v.personaId))],
  };
  const hayDerivados = input.vinculos.some(esDerivado);
  const tienePropio = vigentes.some((v) => !esDerivado(v));
  if (!input.rolResidencial || !hayDerivados || tienePropio) {
    return { ...base, permisos: input.permisosRol as Set<string>, accesoDerivado: false };
  }
  const permisos = new Set<string>();
  if (vigentes.length) {
    const caps = vigentes.flatMap((v) => v.capacidadesHogar);
    for (const p of permisosDeCapacidades(caps)) if (input.permisosRol.has(p)) permisos.add(p);
    for (const p of PERMISOS_SIEMPRE) if (input.permisosRol.has(p)) permisos.add(p);
    if (normalizarCapacidades(caps).includes("cuenta")) for (const p of PERMISOS_CUENTA) permisos.add(p);
  }
  return { ...base, permisos, accesoDerivado: true };
}
