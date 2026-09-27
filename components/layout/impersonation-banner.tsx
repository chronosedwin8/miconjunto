"use client";

import { useRouter } from "next/navigation";
import { salirImpersonacionAction } from "@/app/(superadmin)/superadmin/actions";

export function ImpersonationBanner({ nombre }: { nombre: string }) {
  const router = useRouter();
  return (
    <div role="status" className="flex items-center justify-between gap-2 bg-amber-500 px-4 py-2 text-sm font-medium text-black">
      <span>Modo soporte: estás viendo la app como {nombre}. Todas las acciones quedan auditadas.</span>
      <button
        className="rounded bg-black/15 px-2 py-1"
        onClick={async () => {
          await salirImpersonacionAction();
          router.push("/superadmin");
          router.refresh();
        }}
      >
        Salir
      </button>
    </div>
  );
}
