/** Categorías sugeridas de activos (el campo es texto: se pueden usar otras). */
export const CATEGORIAS_ACTIVO = [
  "Ascensor",
  "Planta eléctrica",
  "Motobomba",
  "Piscina",
  "CCTV",
  "Cámaras",
  "Portón",
  "Extintores",
  "Red contra incendios",
  "Gimnasio",
  "Control de acceso",
  "Citofonía",
  "Iluminación",
  "Aire acondicionado",
  "Juegos infantiles",
  "Otro",
] as const;

export const ESTADOS_ACTIVO = ["OPERATIVO", "EN_MANTENIMIENTO", "FUERA_SERVICIO", "DADO_DE_BAJA"] as const;

/** Prioridad del reporte de falla por QR → días para atender (fecha límite del ticket). */
export const DIAS_SLA_PRIORIDAD: Record<"BAJA" | "MEDIA" | "ALTA" | "URGENTE", number> = { URGENTE: 1, ALTA: 3, MEDIA: 7, BAJA: 15 };
