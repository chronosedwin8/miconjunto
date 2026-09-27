import { getRequestConfig } from "next-intl/server";

/** i18n preparado con next-intl. Solo `es-CO` está activo (sin prefijo de ruta). */
export const LOCALES = ["es-CO"] as const;
export const DEFAULT_LOCALE = "es-CO";

export default getRequestConfig(async () => {
  const locale = DEFAULT_LOCALE;
  return {
    locale,
    timeZone: "America/Bogota",
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
