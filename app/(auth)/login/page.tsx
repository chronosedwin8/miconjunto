import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/context";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Iniciar sesión" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const sp = await searchParams;
  const su = await getSessionUser();
  if (su) redirect(sp.next ?? "/inicio");
  return (
    <>
      <h1 className="mb-1 text-2xl font-bold">Iniciar sesión</h1>
      <p className="mb-6 text-sm text-muted-foreground">Ingresa con el correo registrado en tu conjunto.</p>
      {sp.error === "enlace" && (
        <p role="alert" className="mb-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          El enlace de acceso no es válido o ya fue usado. Solicita uno nuevo.
        </p>
      )}
      <LoginForm next={sp.next} />
    </>
  );
}
