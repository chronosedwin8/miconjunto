import { requirePage } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";
import { fechaHora } from "@/lib/format";
import { spGet, type SP } from "@/lib/pagination";
import { StatusBadge } from "@/components/app/status-badge";
import { EmptyState } from "@/components/app/empty-state";

export const metadata = { title: "Buzón de correos" };

/** Bandeja de salida: todos los correos generados por el conjunto. Sin SMTP funciona como buzón de desarrollo. */
export default async function CorreosPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requirePage("configuracion.ver");
  const sp = await searchParams;
  const correos = await prisma.correoSaliente.findMany({
    where: ctx.esSuperAdmin && spGet(sp, "todos") ? {} : { OR: [{ conjuntoId: ctx.conjuntoId }, { conjuntoId: null }] },
    orderBy: { createdAt: "desc" },
    take: 60,
  });
  const ver = spGet(sp, "id");
  const sel = ver ? correos.find((c) => c.id === ver) : null;
  return (
    <div className="grid gap-4 lg:grid-cols-[22rem_1fr]">
      <div>
        <p className="mb-2 text-sm text-muted-foreground">
          {process.env.SMTP_HOST ? "Correos enviados por SMTP." : "No hay SMTP configurado: los correos quedan aquí para revisarlos (buzón de desarrollo)."}
        </p>
        {correos.length === 0 && <EmptyState titulo="Sin correos" />}
        <ul className="divide-y rounded-xl border bg-card text-sm">
          {correos.map((c) => (
            <li key={c.id}>
              <a href={`?id=${c.id}`} className={`block p-3 hover:bg-muted/50 ${c.id === ver ? "bg-muted" : ""}`}>
                <p className="truncate font-medium">{c.asunto}</p>
                <p className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="truncate">{c.para}</span>
                  <StatusBadge value={c.estado} />
                </p>
                <p className="text-xs text-muted-foreground">{fechaHora(c.createdAt)}</p>
              </a>
            </li>
          ))}
        </ul>
      </div>
      <div className="min-h-96 overflow-hidden rounded-xl border bg-white">
        {sel ? (
          <iframe title={sel.asunto} srcDoc={sel.html} sandbox="" className="h-[80dvh] w-full" />
        ) : (
          <p className="p-6 text-sm text-muted-foreground">Selecciona un correo para verlo.</p>
        )}
      </div>
    </div>
  );
}
