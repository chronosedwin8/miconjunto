import { requirePage } from "@/lib/auth/guard";
import { carteraPorUnidad } from "@/lib/cartera/tablero";
import { horarioCobranzaPermitido, semanaCalendario } from "@/lib/cartera/cobranza";
import { PLANTILLA_CARTA_DEFECTO, VARIABLES_CARTA } from "@/lib/cartera/documentos";
import { can } from "@/lib/permisos";
import { GeneradorCartas } from "./generador";

export const metadata = { title: "Cartas de cobro" };

export default async function CartasPage() {
  const ctx = await requirePage("cartera.gestionar_cobro");
  const filas = await carteraPorUnidad(ctx);
  const semana = semanaCalendario(new Date());
  const cartas = await ctx.db.gestionCobro.findMany({ where: { canal: "CARTA", fecha: { gte: semana.desde, lt: semana.hasta } }, select: { unidadId: true } });
  const conCarta = new Set(cartas.map((c) => c.unidadId));
  const verNombres = can(ctx, "secciones.lista_morosos");
  const morosos = filas
    .filter((f) => f.vencido - f.saldoAFavor > 0)
    .sort((a, b) => b.diasMora - a.diasMora)
    .map((f) => ({ unidadId: f.unidadId, codigo: f.codigo, torre: f.torre, propietario: verNombres ? f.propietario : null, vencido: f.vencido, diasMora: f.diasMora, enAcuerdo: f.enAcuerdo, cartaSemana: conCarta.has(f.unidadId) }));
  const h = horarioCobranzaPermitido(new Date());
  return (
    <>
      <p className="mb-4 max-w-3xl text-sm text-muted-foreground">
        Cartas de cobro prejurídico en PDF (una página por unidad), listas para imprimir o enviar. Al registrarlas quedan como gestión de cobro por el canal «carta», con los límites de horario y frecuencia de la Ley 2300 de 2023.
      </p>
      <GeneradorCartas morosos={morosos} plantillaDefecto={PLANTILLA_CARTA_DEFECTO} variables={VARIABLES_CARTA} horarioOk={h.ok} motivoHorario={h.motivo} />
    </>
  );
}
