/**
 * Catálogo de permisos granular: `modulo.accion`.
 * Se sincroniza a la tabla `Permiso`; `RolPermiso` guarda qué tiene cada rol por conjunto.
 * Los permisos `*.ver_todos` distinguen el alcance: sin él, el usuario solo ve lo suyo.
 */

export type ModuloDef = {
  label: string;
  acciones: Record<string, string>;
  tipo?: "ACCION" | "CAMPO" | "SECCION";
};

export const MODULOS = {
  conjunto: {
    label: "Conjunto y estructura",
    acciones: {
      ver: "Ver torres, unidades, parqueaderos y bodegas",
      crear: "Crear estructura física",
      editar: "Editar estructura física",
      eliminar: "Eliminar estructura física",
      coeficientes: "Editar coeficientes y cuotas",
      importar: "Importar desde Excel",
      exportar: "Exportar",
    },
  },
  zonas: {
    label: "Zonas comunes",
    acciones: { ver: "Ver zonas comunes", crear: "Crear zonas", editar: "Editar zonas", eliminar: "Eliminar zonas" },
  },
  residentes: {
    label: "Residentes y ocupantes",
    acciones: {
      ver: "Ver sus propias unidades y grupo familiar",
      ver_todos: "Ver todos los residentes",
      crear: "Registrar personas y vínculos",
      editar: "Editar personas y vínculos",
      eliminar: "Retirar personas",
      aprobar: "Aprobar vínculos de arrendatarios",
      invitar: "Invitar residentes",
      exportar: "Exportar",
    },
  },
  vehiculos: {
    label: "Vehículos y mascotas",
    acciones: {
      ver: "Ver vehículos y mascotas propios",
      ver_todos: "Ver todos los vehículos y mascotas",
      crear: "Registrar",
      editar: "Editar",
      eliminar: "Eliminar",
    },
  },
  cartera: {
    label: "Cartera",
    acciones: {
      ver: "Ver estado de cuenta propio",
      ver_todos: "Ver cartera de todas las unidades",
      crear: "Crear cuotas y cargos",
      anular: "Anular cuotas",
      generar: "Generar cuotas mensuales y extraordinarias",
      gestionar_cobro: "Registrar gestiones y cartas de cobro",
      acuerdos: "Gestionar acuerdos de pago",
      configurar: "Configurar tasas y parámetros financieros",
      exportar: "Exportar",
    },
  },
  pagos: {
    label: "Pagos y recaudo",
    acciones: {
      ver: "Ver pagos propios",
      ver_todos: "Ver todos los pagos",
      pagar: "Pagar en línea",
      registrar: "Registrar pagos manuales",
      anular: "Anular pagos",
      conciliar: "Conciliación bancaria",
      exportar: "Exportar / exportación contable",
    },
  },
  paz_y_salvo: {
    label: "Paz y salvo",
    acciones: { solicitar: "Solicitar paz y salvo", emitir: "Emitir manualmente", ver_todos: "Ver todos los certificados" },
  },
  facturacion: {
    label: "Facturación electrónica",
    acciones: { ver: "Ver facturas", emitir: "Emitir / reintentar", anular: "Notas crédito", exportar: "Exportar" },
  },
  reservas: {
    label: "Reservas",
    acciones: {
      ver: "Ver y hacer reservas propias",
      ver_todos: "Ver todas las reservas",
      crear: "Reservar",
      aprobar: "Aprobar o rechazar reservas",
      cancelar_todas: "Cancelar cualquier reserva",
      checkin: "Check-in / check-out y acta",
      bloquear: "Bloquear fechas de zonas",
    },
  },
  porteria: {
    label: "Portería",
    acciones: {
      ver: "Acceder a la pantalla de portería",
      registrar: "Registrar ingresos y salidas",
      anular: "Anular registros de bitácora",
      turnos: "Abrir y cerrar turnos",
      novedades: "Registrar novedades",
      lista_negra: "Gestionar lista negra",
      llaves: "Préstamo de llaves y elementos",
      bitacora: "Ver bitácora completa",
    },
  },
  visitantes: {
    label: "Visitantes",
    acciones: { autorizar: "Autorizar visitantes de su unidad", ver_todos: "Ver todas las autorizaciones" },
  },
  paqueteria: {
    label: "Paquetería",
    acciones: {
      ver: "Ver paquetes propios",
      ver_todos: "Ver todos los paquetes",
      recibir: "Recibir paquetes",
      entregar: "Entregar paquetes",
    },
  },
  tickets: {
    label: "PQRS y tickets",
    acciones: {
      ver: "Ver tickets propios",
      ver_todos: "Ver todos los tickets",
      crear: "Crear tickets",
      gestionar: "Cambiar estado, prioridad y responder",
      asignar: "Asignar responsables",
      comentario_interno: "Ver y escribir comentarios internos",
      exportar: "Exportar",
    },
  },
  convivencia: {
    label: "Convivencia y multas",
    acciones: {
      ver: "Ver llamados y multas propios",
      ver_todos: "Ver todos",
      crear: "Crear llamados de atención y multas",
      decidir: "Decidir multas (consejo)",
      infracciones: "Editar catálogo de infracciones",
      incidentes: "Gestionar incidentes de convivencia",
    },
  },
  obras: {
    label: "Obras y mudanzas",
    acciones: { ver: "Ver solicitudes propias", ver_todos: "Ver todas", solicitar: "Solicitar", aprobar: "Aprobar" },
  },
  comunicaciones: {
    label: "Muro y comunicaciones",
    acciones: {
      ver: "Ver el muro",
      publicar: "Publicar avisos oficiales",
      comentar: "Comentar y reaccionar",
      moderar: "Moderar comentarios y clasificados",
      correo_masivo: "Enviar correos masivos",
      segmentos: "Gestionar segmentos",
    },
  },
  clasificados: {
    label: "Clasificados y objetos perdidos",
    acciones: { ver: "Ver", publicar: "Publicar", moderar: "Moderar" },
  },
  documentos: {
    label: "Documentos",
    acciones: { ver: "Ver documentos", crear: "Subir documentos", editar: "Editar", eliminar: "Eliminar" },
  },
  calendario: {
    label: "Calendario",
    acciones: { ver: "Ver calendario", crear: "Crear eventos", editar: "Editar eventos" },
  },
  directorio: {
    label: "Directorios",
    acciones: {
      ver: "Ver directorio de residentes (opt-in)",
      proveedores: "Ver directorio de proveedores",
      calificar: "Calificar proveedores",
    },
  },
  encuestas: {
    label: "Encuestas",
    acciones: { ver: "Ver y responder", crear: "Crear encuestas", resultados: "Ver resultados detallados" },
  },
  votaciones: {
    label: "Votaciones",
    acciones: { ver: "Ver votaciones", votar: "Votar", crear: "Crear votaciones", cerrar: "Cerrar/anular" },
  },
  asambleas: {
    label: "Asambleas",
    acciones: {
      ver: "Ver asambleas",
      crear: "Crear y convocar",
      gestionar: "Conducir asamblea, quórum y actas",
      asistencia: "Registrar asistencia",
      poderes: "Aprobar poderes",
    },
  },
  consejo: {
    label: "Consejo de administración",
    acciones: { ver: "Ver consejo y reuniones", gestionar: "Gestionar miembros y reuniones" },
  },
  activos: {
    label: "Activos",
    acciones: { ver: "Ver activos", crear: "Crear", editar: "Editar", eliminar: "Eliminar" },
  },
  mantenimiento: {
    label: "Mantenimiento",
    acciones: {
      ver: "Ver planes y órdenes",
      ver_todos: "Ver todas las órdenes (sin esto, solo las asignadas)",
      crear: "Crear planes y órdenes",
      gestionar: "Gestionar órdenes de trabajo",
      ejecutar: "Ejecutar órdenes asignadas",
    },
  },
  proveedores: {
    label: "Proveedores y contratos",
    acciones: { ver: "Ver", crear: "Crear", editar: "Editar", eliminar: "Eliminar" },
  },
  presupuesto: {
    label: "Presupuesto y gastos",
    acciones: {
      ver: "Ver presupuesto y ejecución",
      editar: "Editar presupuesto y registrar gastos",
      aprobar_gastos: "Aprobar gastos",
      exportar: "Exportación contable",
    },
  },
  empleados: {
    label: "Empleados del conjunto",
    acciones: { ver: "Ver", crear: "Crear", editar: "Editar" },
  },
  estadisticas: {
    label: "Estadísticas",
    acciones: { ver: "Ver tableros del conjunto", personal: "Ver panel personal", exportar: "Exportar" },
  },
  emergencias: {
    label: "Emergencias",
    acciones: {
      panico: "Botón de pánico",
      ver: "Ver plan de emergencia",
      gestionar: "Gestionar plan, brigadistas y simulacros",
      lista_evacuacion: "Ver lista de evacuación asistida",
    },
  },
  configuracion: {
    label: "Configuración",
    acciones: {
      ver: "Ver configuración",
      editar: "Editar parámetros del conjunto",
      roles: "Roles y permisos",
      integraciones: "Pasarelas, Factus, SMTP",
      api: "Tokens de API y webhooks",
    },
  },
  auditoria: { label: "Auditoría", acciones: { ver: "Ver auditoría" } },
  ia: { label: "Asistente IA", acciones: { usar: "Usar el asistente" } },
  informes: {
    label: "Informes",
    acciones: { historial_unidad: "Historial de unidad", empalme: "Informe de empalme" },
  },
  // Campos y secciones visibles (configuración → visibilidad)
  campos: {
    label: "Campos visibles",
    tipo: "CAMPO",
    acciones: {
      persona_telefono: "Ver teléfono y correo de personas",
      persona_documento: "Ver número de documento",
      persona_salud: "Ver datos de salud y movilidad reducida",
      unidad_financiero: "Ver información financiera de unidades",
    },
  },
  secciones: {
    label: "Indicadores visibles",
    tipo: "SECCION",
    acciones: {
      mora_conjunto: "Ver % de mora del conjunto",
      recaudo_conjunto: "Ver recaudo del conjunto",
      lista_morosos: "Ver lista de morosos",
      ocupacion_zonas: "Ver ocupación de zonas",
      pqrs_conjunto: "Ver indicadores de PQRS",
    },
  },
} satisfies Record<string, ModuloDef>;

export type ModuloKey = keyof typeof MODULOS;
export type PermKey = {
  [M in ModuloKey]: `${M}.${Extract<keyof (typeof MODULOS)[M]["acciones"], string>}`;
}[ModuloKey];

export const ALL_PERMS: PermKey[] = Object.entries(MODULOS).flatMap(([m, def]) =>
  Object.keys(def.acciones).map((a) => `${m}.${a}` as PermKey),
);

export function permCatalog() {
  return Object.entries(MODULOS).flatMap(([m, def]) =>
    Object.entries(def.acciones).map(([a, descripcion]) => ({
      clave: `${m}.${a}`,
      modulo: m,
      accion: a,
      descripcion,
      tipo: (def as ModuloDef).tipo ?? "ACCION",
    })),
  );
}

export const ROLES_BASE = [
  "ADMINISTRADOR",
  "CONSEJO",
  "REVISOR_FISCAL",
  "CONTADOR",
  "ASISTENTE_ADMIN",
  "PORTERIA",
  "MANTENIMIENTO",
  "PROPIETARIO",
  "RESIDENTE",
  "CONVIVIENTE",
  "PROVEEDOR",
] as const;
export type RolBase = (typeof ROLES_BASE)[number];

export const ROL_LABEL: Record<RolBase | "SUPERADMIN", string> = {
  SUPERADMIN: "SuperAdmin MiConjunto",
  ADMINISTRADOR: "Administrador",
  CONSEJO: "Consejo de administración",
  REVISOR_FISCAL: "Revisor fiscal",
  CONTADOR: "Contador",
  ASISTENTE_ADMIN: "Asistente administrativo",
  PORTERIA: "Portería",
  MANTENIMIENTO: "Mantenimiento",
  PROPIETARIO: "Propietario",
  RESIDENTE: "Residente",
  CONVIVIENTE: "Conviviente",
  PROVEEDOR: "Proveedor",
};

/** Roles cuyo alcance se limita a sus propias unidades. */
export const ROLES_RESIDENCIALES: ReadonlySet<string> = new Set(["PROPIETARIO", "RESIDENTE", "CONVIVIENTE"]);

function match(patterns: string[]): PermKey[] {
  const out = new Set<PermKey>();
  for (const p of patterns) {
    const neg = p.startsWith("!");
    const pat = neg ? p.slice(1) : p;
    const re = new RegExp("^" + pat.replace(/\./g, "\\.").replace(/\*/g, "[a-z_]+") + "$");
    for (const k of ALL_PERMS) {
      if (re.test(k)) {
        if (neg) out.delete(k);
        else out.add(k);
      }
    }
  }
  return [...out];
}

const RESIDENTE_COMUN = [
  "conjunto.ver",
  "zonas.ver",
  "residentes.ver",
  "vehiculos.ver",
  "vehiculos.crear",
  "vehiculos.editar",
  "vehiculos.eliminar",
  "reservas.ver",
  "reservas.crear",
  "visitantes.autorizar",
  "paqueteria.ver",
  "tickets.ver",
  "tickets.crear",
  "convivencia.ver",
  "obras.ver",
  "obras.solicitar",
  "comunicaciones.ver",
  "comunicaciones.comentar",
  "clasificados.ver",
  "clasificados.publicar",
  "documentos.ver",
  "calendario.ver",
  "directorio.ver",
  "directorio.proveedores",
  "directorio.calificar",
  "encuestas.ver",
  "votaciones.ver",
  "asambleas.ver",
  "estadisticas.personal",
  "emergencias.panico",
  "emergencias.ver",
  "ia.usar",
];

/** Matriz por defecto de permisos por rol base. El administrador puede cambiarla por conjunto. */
export const DEFAULT_ROLE_PERMS: Record<RolBase, PermKey[]> = {
  ADMINISTRADOR: match(["*.*"]),
  CONSEJO: match([
    "*.ver",
    "*.ver_todos",
    "cartera.exportar",
    "pagos.exportar",
    "reservas.aprobar",
    "tickets.comentario_interno",
    "convivencia.crear",
    "convivencia.decidir",
    "convivencia.incidentes",
    "comunicaciones.publicar",
    "comunicaciones.comentar",
    "encuestas.crear",
    "encuestas.resultados",
    "votaciones.votar",
    "votaciones.crear",
    "asambleas.crear",
    "asambleas.gestionar",
    "consejo.gestionar",
    "presupuesto.aprobar_gastos",
    "estadisticas.*",
    "paz_y_salvo.solicitar",
    "reservas.crear",
    "visitantes.autorizar",
    "tickets.crear",
    "directorio.*",
    "emergencias.panico",
    "emergencias.lista_evacuacion",
    "campos.*",
    "secciones.*",
    "informes.*",
    "ia.usar",
    "!porteria.ver",
    "!configuracion.ver",
    "!auditoria.ver",
  ]),
  REVISOR_FISCAL: match([
    "cartera.ver",
    "cartera.ver_todos",
    "cartera.exportar",
    "pagos.ver",
    "pagos.ver_todos",
    "pagos.exportar",
    "facturacion.ver",
    "facturacion.exportar",
    "paz_y_salvo.ver_todos",
    "presupuesto.ver",
    "presupuesto.exportar",
    "asambleas.ver",
    "documentos.ver",
    "conjunto.ver",
    "estadisticas.ver",
    "auditoria.ver",
    "campos.unidad_financiero",
    "secciones.*",
    "informes.empalme",
  ]),
  CONTADOR: match([
    "cartera.*",
    "!cartera.configurar",
    "pagos.*",
    "!pagos.pagar",
    "paz_y_salvo.*",
    "!paz_y_salvo.solicitar",
    "facturacion.*",
    "presupuesto.*",
    "conjunto.ver",
    "residentes.ver",
    "residentes.ver_todos",
    "documentos.ver",
    "estadisticas.ver",
    "estadisticas.exportar",
    "campos.unidad_financiero",
    "campos.persona_documento",
    "secciones.*",
  ]),
  ASISTENTE_ADMIN: match([
    "conjunto.ver",
    "zonas.ver",
    "zonas.editar",
    "residentes.*",
    "!residentes.eliminar",
    "vehiculos.*",
    "!vehiculos.eliminar",
    "reservas.*",
    "tickets.*",
    "convivencia.ver",
    "convivencia.ver_todos",
    "obras.*",
    "comunicaciones.*",
    "clasificados.*",
    "documentos.ver",
    "documentos.crear",
    "calendario.*",
    "directorio.*",
    "encuestas.*",
    "paqueteria.ver",
    "paqueteria.ver_todos",
    "cartera.ver",
    "cartera.ver_todos",
    "paz_y_salvo.*",
    "!paz_y_salvo.solicitar",
    "proveedores.ver",
    "activos.ver",
    "mantenimiento.ver",
    "mantenimiento.ver_todos",
    "mantenimiento.crear",
    "estadisticas.ver",
    "emergencias.*",
    "campos.persona_telefono",
    "campos.persona_documento",
    "secciones.*",
    "informes.historial_unidad",
    "ia.usar",
  ]),
  PORTERIA: match([
    "porteria.*",
    "!porteria.anular",
    "!porteria.lista_negra",
    "paqueteria.ver",
    "paqueteria.ver_todos",
    "paqueteria.recibir",
    "paqueteria.entregar",
    "visitantes.ver_todos",
    "residentes.ver_todos",
    "vehiculos.ver_todos",
    "reservas.ver_todos",
    "reservas.checkin",
    "tickets.crear",
    "tickets.ver",
    "conjunto.ver",
    "emergencias.*",
    "!emergencias.gestionar",
    "comunicaciones.ver",
    "obras.ver_todos",
    "calendario.ver",
    "empleados.ver",
  ]),
  MANTENIMIENTO: match([
    "tickets.ver",
    "tickets.gestionar",
    "tickets.comentario_interno",
    "activos.ver",
    "activos.editar",
    "mantenimiento.ver",
    "mantenimiento.ejecutar",
    "mantenimiento.gestionar",
    "zonas.ver",
    "conjunto.ver",
    "comunicaciones.ver",
    "calendario.ver",
    "proveedores.ver",
  ]),
  PROPIETARIO: match([
    ...RESIDENTE_COMUN,
    "cartera.ver",
    "pagos.ver",
    "pagos.pagar",
    "paz_y_salvo.solicitar",
    "facturacion.ver",
    "residentes.crear",
    "residentes.editar",
    "residentes.invitar",
    "votaciones.votar",
    "campos.unidad_financiero",
  ]),
  RESIDENTE: match([...RESIDENTE_COMUN, "residentes.crear", "residentes.editar", "residentes.invitar"]),
  CONVIVIENTE: match([
    "comunicaciones.ver",
    "comunicaciones.comentar",
    "reservas.ver",
    "reservas.crear",
    "visitantes.autorizar",
    "paqueteria.ver",
    "calendario.ver",
    "clasificados.ver",
    "documentos.ver",
    "encuestas.ver",
    "emergencias.panico",
    "emergencias.ver",
    "directorio.proveedores",
  ]),
  PROVEEDOR: match(["mantenimiento.ver", "mantenimiento.ejecutar"]),
};

export function defaultPermsFor(rolBase: string): PermKey[] {
  return DEFAULT_ROLE_PERMS[rolBase as RolBase] ?? [];
}
