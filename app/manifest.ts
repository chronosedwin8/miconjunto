import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MiConjunto — Administración de propiedad horizontal",
    short_name: "MiConjunto",
    description: "Pagos, reservas, portería, PQRS y comunicaciones de tu conjunto.",
    start_url: "/inicio",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f7faf9",
    theme_color: "#0f766e",
    lang: "es-CO",
    categories: ["productivity", "lifestyle"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Pagar", url: "/cuenta/pagar" },
      { name: "Autorizar visitante", url: "/visitantes/nuevo" },
      { name: "Reservar", url: "/reservas" },
      { name: "Portería", url: "/porteria" },
    ],
  };
}
