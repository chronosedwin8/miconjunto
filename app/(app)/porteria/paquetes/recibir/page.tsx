import { requirePage } from "@/lib/auth/guard";
import { spGet, type SP } from "@/lib/pagination";
import { unidadOptions } from "@/lib/conjunto/options";
import { KTitle } from "../../_components/kiosk";
import { RecibirPaqueteForm } from "../../_components/paquetes";

export const metadata = { title: "Recibir paquete" };

export default async function RecibirPaquetePage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requirePage("paqueteria.recibir");
  const sp = await searchParams;
  return (
    <>
      <KTitle>Recibir paquete</KTitle>
      <div className="max-w-2xl">
        <RecibirPaqueteForm unidades={await unidadOptions(ctx)} unidadId={spGet(sp, "unidadId")} />
      </div>
    </>
  );
}
