import type { MetadataRoute } from "next";
import { urlSitio } from "@/components/marketing/contenido";

/** Solo las páginas públicas del sitio comercial; la app requiere sesión y no se indexa. */
export default function sitemap(): MetadataRoute.Sitemap {
  const hoy = new Date();
  return [
    { url: urlSitio("/"), lastModified: hoy, changeFrequency: "weekly", priority: 1 },
    { url: urlSitio("/funcionalidades"), lastModified: hoy, changeFrequency: "monthly", priority: 0.8 },
    { url: urlSitio("/precios"), lastModified: hoy, changeFrequency: "monthly", priority: 0.9 },
    { url: urlSitio("/politica-datos"), lastModified: hoy, changeFrequency: "yearly", priority: 0.2 },
  ];
}
