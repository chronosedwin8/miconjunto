import { Lock } from "lucide-react";

/** Diseño de las páginas públicas de pago (sin sesión). */
export default function PagarLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col bg-gradient-to-b from-primary/10 via-background to-background">
      <div className="mx-auto w-full max-w-md flex-1 px-4 py-6">{children}</div>
      <footer className="flex items-center justify-center gap-1.5 pb-6 text-center text-xs text-muted-foreground">
        <Lock className="size-3.5" aria-hidden="true" /> Pagos protegidos · MiConjunto ·{" "}
        <a className="underline" href="/politica-datos">
          Política de datos
        </a>
      </footer>
    </main>
  );
}
