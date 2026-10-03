import { Button } from "@/components/ui/button";
import { magicLoginAction } from "../actions";

export const metadata = { title: "Acceso" };

/** El token se consume solo al tocar el botón (evita que los escáneres de correo lo invaliden). */
export default async function AccesoPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Entrar a Conjunto360</h1>
      <p className="text-sm text-muted-foreground">Toca el botón para iniciar sesión con tu enlace de acceso.</p>
      <form action={magicLoginAction}>
        <input type="hidden" name="token" value={token ?? ""} />
        <Button size="lg" className="w-full">
          Iniciar sesión
        </Button>
      </form>
    </div>
  );
}
