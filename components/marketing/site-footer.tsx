import Link from "next/link";
import { Logo } from "./logo";

export function SiteFooter() {
  const anio = new Date().getFullYear();
  return (
    <footer className="border-t bg-muted/40">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:grid-cols-2 lg:grid-cols-4 lg:px-8">
        <div className="space-y-3 lg:col-span-2">
          <Logo />
          <p className="max-w-sm text-sm text-muted-foreground">
            Software colombiano para administrar conjuntos residenciales y propiedad horizontal, alineado con la Ley 675 de 2001 y la Ley 1581 de 2012.
          </p>
        </div>
        <nav aria-label="Producto" className="space-y-2 text-sm">
          <p className="font-semibold">Producto</p>
          <Link className="block text-muted-foreground hover:text-foreground" href="/funcionalidades">Funcionalidades</Link>
          <Link className="block text-muted-foreground hover:text-foreground" href="/precios">Precios</Link>
          <Link className="block text-muted-foreground hover:text-foreground" href="/precios#cotizador">Cotizador multiconjunto</Link>
          <Link className="block text-muted-foreground hover:text-foreground" href="/#preguntas">Preguntas frecuentes</Link>
        </nav>
        <nav aria-label="Cuenta" className="space-y-2 text-sm">
          <p className="font-semibold">Clientes</p>
          <Link className="block text-muted-foreground hover:text-foreground" href="/login">Ingresar a la app</Link>
          <Link className="block text-muted-foreground hover:text-foreground" href="/recuperar">Recuperar contraseña</Link>
          <Link className="block text-muted-foreground hover:text-foreground" href="/politica-datos">Política de tratamiento de datos</Link>
        </nav>
      </div>
      <p className="border-t px-4 py-5 text-center text-xs text-muted-foreground">© {anio} Conjunto360 · Hecho en Colombia</p>
    </footer>
  );
}
