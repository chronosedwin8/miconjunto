import { ImageResponse } from "next/og";

export const alt = "Conjunto360 · Software para administrar conjuntos residenciales en Colombia";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Imagen para compartir en redes (WhatsApp, LinkedIn, Facebook, X). */
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: "linear-gradient(135deg, #0f766e 0%, #065f46 100%)", color: "white", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ width: 72, height: 72, borderRadius: 18, background: "rgba(255,255,255,0.18)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 40, fontWeight: 800 }}>C</div>
          <div style={{ fontSize: 40, fontWeight: 800 }}>Conjunto360</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ fontSize: 66, fontWeight: 800, lineHeight: 1.05, maxWidth: 980 }}>La administración de tu conjunto residencial, en una sola app</div>
          <div style={{ fontSize: 30, opacity: 0.9 }}>Cartera y pagos en línea · Portería · Reservas · PQRS · Asambleas</div>
        </div>
        <div style={{ display: "flex", fontSize: 26, opacity: 0.85 }}>Software para propiedad horizontal en Colombia</div>
      </div>
    ),
    size,
  );
}
