import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Sin permiso" };

export default function SinPermisoPage() {
  return (
    <div className="flex flex-col items-center py-16 text-center">
      <ShieldAlert className="mb-3 size-12 text-muted-foreground" />
      <h1 className="text-xl font-bold">No tienes acceso a esta sección</h1>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">Si crees que es un error, pide a la administración que revise los permisos de tu rol.</p>
      <Button className="mt-6" render={<Link href="/inicio" />}>
        Ir al inicio
      </Button>
    </div>
  );
}
