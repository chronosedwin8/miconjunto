import type { MetadataRoute } from "next";
import { urlSitio } from "@/components/marketing/contenido";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/funcionalidades", "/precios", "/politica-datos"],
        // La app, los enlaces privados (pagos, invitaciones, QR) y la API no se indexan.
        disallow: ["/api/", "/inicio", "/login", "/superadmin", "/pagar", "/invitacion", "/acceso", "/acceso-visitante", "/verificar", "/activo", "/c/", "/seleccionar-conjunto"],
      },
    ],
    sitemap: urlSitio("/sitemap.xml"),
    host: urlSitio(""),
  };
}
