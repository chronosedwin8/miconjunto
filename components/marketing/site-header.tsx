import Link from "next/link";
import { LogIn, Menu } from "lucide-react";
import { Logo } from "./logo";

const LINKS = [
  { href: "/funcionalidades", label: "Funcionalidades" },
  { href: "/precios", label: "Precios" },
  { href: "/precios#cotizador", label: "Cotizador" },
  { href: "/#preguntas", label: "Preguntas" },
];

/** Encabezado del sitio comercial. El menú móvil usa <details> para funcionar sin JavaScript. */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 lg:px-8">
        <Logo />
        <nav aria-label="Principal" className="ml-6 hidden items-center gap-1 md:flex">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <Link href="/login" className="hidden h-10 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-foreground hover:bg-muted sm:inline-flex">
            <LogIn className="size-4" aria-hidden /> Ingresar a la app
          </Link>
          <Link href="/precios#cotizador" className="inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90">
            Cotizar
          </Link>
          <details className="group relative md:hidden">
            <summary className="grid size-10 cursor-pointer list-none place-items-center rounded-lg border bg-background [&::-webkit-details-marker]:hidden" aria-label="Abrir menú">
              <Menu className="size-5" aria-hidden />
            </summary>
            <nav aria-label="Menú móvil" className="absolute right-0 top-12 w-60 rounded-xl border bg-popover p-2 shadow-xl">
              {LINKS.map((l) => (
                <Link key={l.href} href={l.href} className="flex min-h-11 items-center rounded-lg px-3 text-sm font-medium hover:bg-muted">
                  {l.label}
                </Link>
              ))}
              <Link href="/login" className="mt-1 flex min-h-11 items-center gap-2 rounded-lg bg-muted px-3 text-sm font-semibold">
                <LogIn className="size-4" aria-hidden /> Ingresar a la app
              </Link>
            </nav>
          </details>
        </div>
      </div>
    </header>
  );
}
