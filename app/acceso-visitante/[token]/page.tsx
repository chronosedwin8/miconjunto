import QRCode from "qrcode";
import { headers } from "next/headers";
import { pasePublico } from "@/lib/porteria/autorizaciones";
import { rateLimit } from "@/lib/rate-limit";

export const metadata = { title: "Pase de ingreso", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * Página pública del pase de visitante: muestra el QR grande y el código de 6 dígitos para presentar en portería.
 * No requiere sesión ni instalar nada. Solo datos mínimos (sin datos personales del residente).
 */
export default async function AccesoVisitantePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const limit = rateLimit(`pase:${ip}`, 60, 60_000);
  const pase = limit.ok ? await pasePublico(token) : null;
  if (!pase) {
    return (
      <main className="grid min-h-dvh place-items-center bg-zinc-50 p-6 text-center text-zinc-900">
        <div>
          <p className="text-2xl font-bold">Pase no encontrado</p>
          <p className="mt-2 text-zinc-600">El enlace no es válido. Pide a quien te invitó que te envíe uno nuevo.</p>
        </div>
      </main>
    );
  }
  const activo = pase.estado === "ACTIVA" && pase.evaluacion.ok;
  const qr = await QRCode.toDataURL(pase.url, { width: 640, margin: 1, errorCorrectionLevel: "M" });
  const color = pase.conjunto.colorPrimario || "#0f766e";
  const estadoTexto: Record<string, string> = { USADA: "Este pase ya fue usado.", VENCIDA: "Este pase venció.", REVOCADA: "Este pase fue cancelado por el residente." };
  return (
    <main className="min-h-dvh bg-zinc-50 text-zinc-900">
      <div className="px-5 py-4 text-white" style={{ background: color }}>
        <p className="text-sm opacity-90">Pase de ingreso</p>
        <p className="text-xl font-bold">{pase.conjunto.nombre}</p>
        {(pase.conjunto.direccion || pase.conjunto.ciudad) && <p className="text-sm opacity-90">{[pase.conjunto.direccion, pase.conjunto.ciudad].filter(Boolean).join(", ")}</p>}
      </div>
      <div className="mx-auto max-w-md p-5 text-center">
        <p className="text-sm text-zinc-600">Hola,</p>
        <p className="text-2xl font-extrabold">{pase.nombreVisitante}</p>
        <p className="mt-1 text-base">
          {pase.tipo} · visita a <b>{pase.unidad}</b>
        </p>
        <div className={`mx-auto mt-5 rounded-3xl bg-white p-4 shadow-lg ring-1 ring-zinc-200 ${activo ? "" : "opacity-40"}`}>
          <img src={qr} alt="Código QR de ingreso" className="mx-auto aspect-square w-full" />
          <p className="mt-2 text-sm text-zinc-600">o dicta este código en portería</p>
          <p className="font-mono text-5xl font-black tracking-[0.2em]">{pase.codigo}</p>
        </div>
        <p className="mt-4 text-base font-semibold">{pase.vigencia}</p>
        {pase.placa && <p className="text-base">Vehículo autorizado: <b className="font-mono">{pase.placa}</b></p>}
        {!activo && <p className="mt-3 rounded-xl bg-red-100 p-3 font-semibold text-red-900">{estadoTexto[pase.estado] ?? (pase.evaluacion.ok ? "" : pase.evaluacion.motivo)}</p>}
        <p className="mt-6 text-xs text-zinc-500">Muestra esta pantalla al llegar. Sube el brillo de tu celular para que el QR se lea mejor.</p>
      </div>
    </main>
  );
}
