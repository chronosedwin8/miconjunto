import { saludJobs } from "@/lib/superadmin/service";
import { prisma } from "@/lib/db";
import { fechaHora } from "@/lib/format";
import { StatusBadge } from "@/components/app/status-badge";
import { Section } from "@/components/app/page-header";

export const metadata = { title: "Jobs e integraciones" };

export default async function JobsPage() {
  const [jobs, correos, facturas, webhooks] = await Promise.all([
    saludJobs(),
    prisma.correoSaliente.groupBy({ by: ["estado"], _count: true }),
    prisma.facturaElectronica.groupBy({ by: ["estado"], _count: true }),
    prisma.entregaWebhook.groupBy({ by: ["estado"], _count: true }),
  ]);
  const integr = [
    { nombre: "SMTP global", ok: !!process.env.SMTP_HOST },
    { nombre: "Wompi global", ok: !!process.env.WOMPI_PUBLIC_KEY },
    { nombre: "Mercado Pago global", ok: !!process.env.MP_ACCESS_TOKEN },
    { nombre: "Factus global", ok: !!process.env.FACTUS_CLIENT_ID },
    { nombre: "Alanube global", ok: !!process.env.ALANUBE_TOKEN },
    { nombre: "WhatsApp", ok: !!process.env.WHATSAPP_TOKEN },
    { nombre: "Push (VAPID)", ok: !!process.env.VAPID_PRIVATE_KEY },
    { nombre: "Asistente IA (Anthropic)", ok: !!process.env.ANTHROPIC_API_KEY },
    { nombre: "Almacenamiento S3", ok: process.env.STORAGE_DRIVER === "s3" },
  ];
  return (
    <>
      <Section titulo="Jobs programados (pg-boss)">
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs">
              <tr>
                <th className="p-2">Job</th>
                <th className="p-2">Cron</th>
                <th className="p-2">Última ejecución</th>
                <th className="p-2">7 días</th>
                <th className="p-2">Estado</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j.name} className="border-t">
                  <td className="p-2">
                    <p className="font-medium">{j.name}</p>
                    <p className="text-xs text-muted-foreground">{j.descripcion}</p>
                  </td>
                  <td className="p-2 font-mono text-xs">{j.cron}</td>
                  <td className="p-2 text-xs">{fechaHora(j.ultimaEjecucion)}</td>
                  <td className="p-2 text-xs">
                    ✓ {j.completados} · ✗ {j.fallidos}
                  </td>
                  <td className="p-2">{j.ultimoEstado ? <StatusBadge value={j.ultimoEstado === "completed" ? "COMPLETADA" : j.ultimoEstado === "failed" ? "ERROR" : "PENDIENTE"} text={j.ultimoEstado} /> : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
      <div className="grid gap-4 md:grid-cols-2">
        <Section titulo="Integraciones globales">
          <ul className="divide-y rounded-xl border bg-card text-sm">
            {integr.map((i) => (
              <li key={i.nombre} className="flex justify-between p-3">
                {i.nombre} <StatusBadge value={i.ok ? "ACTIVA" : "INACTIVO"} text={i.ok ? "Configurada" : "Sin credenciales"} />
              </li>
            ))}
          </ul>
        </Section>
        <Section titulo="Colas">
          <ul className="space-y-2 rounded-xl border bg-card p-3 text-sm">
            <li>Correos: {correos.map((c) => `${c.estado.toLowerCase()} ${c._count}`).join(" · ") || "—"}</li>
            <li>Facturas electrónicas: {facturas.map((c) => `${c.estado.toLowerCase()} ${c._count}`).join(" · ") || "—"}</li>
            <li>Webhooks: {webhooks.map((c) => `${c.estado.toLowerCase()} ${c._count}`).join(" · ") || "—"}</li>
          </ul>
        </Section>
      </div>
    </>
  );
}
