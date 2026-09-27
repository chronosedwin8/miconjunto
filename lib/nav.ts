import type { PermKey } from "@/lib/permisos/catalog";

export type NavItem = {
  href: string;
  label: string;
  icon: string; // nombre de ícono lucide (ver components/layout/icons.tsx)
  perm?: PermKey | PermKey[];
  /** Solo para roles residenciales (propietario/residente/conviviente). */
  soloResidencial?: boolean;
  /** Oculto para roles residenciales. */
  soloGestion?: boolean;
  modulo?: string;
};

export type NavGroup = { titulo: string; items: NavItem[] };

export const NAV_GROUPS: NavGroup[] = [
  {
    titulo: "Mi hogar",
    items: [
      { href: "/inicio", label: "Inicio", icon: "home" },
      { href: "/cuenta", label: "Mi cuenta y pagos", icon: "wallet", perm: "cartera.ver", soloResidencial: true },
      { href: "/mi-hogar", label: "Mi hogar", icon: "house", perm: "residentes.ver", soloResidencial: true },
      { href: "/visitantes", label: "Visitantes", icon: "user-check", perm: "visitantes.autorizar", soloResidencial: true },
      { href: "/paquetes", label: "Mis paquetes", icon: "package", perm: "paqueteria.ver", soloResidencial: true },
      { href: "/reservas", label: "Reservas", icon: "calendar-check", perm: "reservas.ver" },
      { href: "/tickets", label: "PQRS y daños", icon: "life-buoy", perm: ["tickets.ver", "tickets.ver_todos"] },
      { href: "/obras", label: "Obras y mudanzas", icon: "hammer", perm: ["obras.ver", "obras.ver_todos"] },
    ],
  },
  {
    titulo: "Comunidad",
    items: [
      { href: "/muro", label: "Muro", icon: "megaphone", perm: "comunicaciones.ver" },
      { href: "/calendario", label: "Calendario", icon: "calendar", perm: "calendario.ver" },
      { href: "/documentos", label: "Documentos", icon: "folder", perm: "documentos.ver" },
      { href: "/encuestas", label: "Encuestas", icon: "list-checks", perm: "encuestas.ver" },
      { href: "/votaciones", label: "Votaciones", icon: "vote", perm: "votaciones.ver" },
      { href: "/asambleas", label: "Asambleas", icon: "landmark", perm: "asambleas.ver" },
      { href: "/directorio", label: "Directorio", icon: "book-user", perm: ["directorio.ver", "directorio.proveedores"] },
      { href: "/clasificados", label: "Clasificados y perdidos", icon: "store", perm: "clasificados.ver" },
      { href: "/emergencias", label: "Emergencias", icon: "siren", perm: ["emergencias.ver", "emergencias.gestionar"] },
      { href: "/asistente", label: "Asistente IA", icon: "sparkles", perm: "ia.usar", modulo: "ia" },
    ],
  },
  {
    titulo: "Administración",
    items: [
      { href: "/porteria", label: "Portería", icon: "shield", perm: "porteria.ver" },
      { href: "/cartera", label: "Cartera", icon: "landmark", perm: "cartera.ver_todos", soloGestion: true },
      { href: "/facturacion", label: "Facturación electrónica", icon: "receipt", perm: "facturacion.ver", soloGestion: true },
      { href: "/residentes", label: "Residentes", icon: "users", perm: "residentes.ver_todos" },
      { href: "/conjunto", label: "Conjunto y unidades", icon: "building", perm: "conjunto.ver", soloGestion: true },
      { href: "/convivencia", label: "Convivencia y multas", icon: "scale", perm: ["convivencia.ver", "convivencia.ver_todos"] },
      { href: "/comunicaciones", label: "Correo masivo", icon: "mail", perm: "comunicaciones.correo_masivo" },
      { href: "/consejo", label: "Consejo", icon: "users-round", perm: "consejo.ver" },
      { href: "/mantenimiento", label: "Mantenimiento", icon: "wrench", perm: "mantenimiento.ver" },
      { href: "/activos", label: "Activos", icon: "boxes", perm: "activos.ver" },
      { href: "/proveedores", label: "Proveedores y contratos", icon: "briefcase", perm: "proveedores.ver" },
      { href: "/presupuesto", label: "Presupuesto y gastos", icon: "piggy-bank", perm: "presupuesto.ver" },
      { href: "/empleados", label: "Empleados", icon: "id-card", perm: "empleados.ver" },
      { href: "/estadisticas", label: "Estadísticas", icon: "chart", perm: ["estadisticas.ver", "estadisticas.personal"] },
      { href: "/informes", label: "Informes", icon: "file-text", perm: ["informes.historial_unidad", "informes.empalme"] },
      { href: "/configuracion", label: "Configuración", icon: "settings", perm: "configuracion.ver" },
      { href: "/auditoria", label: "Auditoría", icon: "history", perm: "auditoria.ver" },
    ],
  },
];

export type BottomItem = { href: string; label: string; icon: string };

/** Navegación inferior fija (5 íconos) según el rol. */
export function bottomNavFor(rolBase: string, perms: Set<string>, esSuperAdmin: boolean): BottomItem[] {
  const has = (p: string) => esSuperAdmin || perms.has(p);
  if (rolBase === "PORTERIA") {
    return [
      { href: "/porteria", label: "Portería", icon: "shield" },
      { href: "/porteria/bitacora", label: "Bitácora", icon: "list" },
      { href: "/porteria/paquetes", label: "Paquetes", icon: "package" },
      { href: "/porteria/turno", label: "Turno", icon: "clock" },
      { href: "/mas", label: "Más", icon: "menu" },
    ];
  }
  if (rolBase === "MANTENIMIENTO" || rolBase === "PROVEEDOR") {
    return [
      { href: "/inicio", label: "Inicio", icon: "home" },
      { href: "/mantenimiento", label: "Órdenes", icon: "wrench" },
      { href: "/tickets", label: "Tickets", icon: "life-buoy" },
      { href: "/activos", label: "Activos", icon: "boxes" },
      { href: "/mas", label: "Más", icon: "menu" },
    ];
  }
  if (["PROPIETARIO", "RESIDENTE", "CONVIVIENTE"].includes(rolBase)) {
    return [
      { href: "/inicio", label: "Inicio", icon: "home" },
      has("cartera.ver") ? { href: "/cuenta", label: "Pagar", icon: "wallet" } : { href: "/muro", label: "Muro", icon: "megaphone" },
      { href: "/reservas", label: "Reservar", icon: "calendar-check" },
      { href: "/visitantes", label: "Visitantes", icon: "user-check" },
      { href: "/mas", label: "Más", icon: "menu" },
    ];
  }
  return [
    { href: "/inicio", label: "Inicio", icon: "home" },
    has("cartera.ver_todos") ? { href: "/cartera", label: "Cartera", icon: "wallet" } : { href: "/muro", label: "Muro", icon: "megaphone" },
    { href: "/reservas", label: "Reservas", icon: "calendar-check" },
    has("porteria.ver") ? { href: "/porteria", label: "Portería", icon: "shield" } : { href: "/tickets", label: "PQRS", icon: "life-buoy" },
    { href: "/mas", label: "Más", icon: "menu" },
  ];
}

export function visibleNav(ctx: { permisos: Set<string>; esSuperAdmin: boolean; rolBase: string; conjunto: { modulosActivos: string[] } }, iaDisponible: boolean) {
  const residencial = ["PROPIETARIO", "RESIDENTE", "CONVIVIENTE"].includes(ctx.rolBase);
  const has = (p: PermKey | PermKey[] | undefined) =>
    !p || ctx.esSuperAdmin || (Array.isArray(p) ? p.some((x) => ctx.permisos.has(x)) : ctx.permisos.has(p));
  return NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((i) => {
      if (i.modulo === "ia" && !iaDisponible) return false;
      if (i.soloResidencial && !residencial) return false;
      if (i.soloGestion && residencial) return false;
      return has(i.perm);
    }),
  })).filter((g) => g.items.length > 0);
}
