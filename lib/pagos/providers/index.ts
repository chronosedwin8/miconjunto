import type { Pasarela } from "@prisma/client";
import { credenciales } from "@/lib/integraciones/service";
import { parseConfig } from "@/lib/conjunto/config";
import { AppError } from "@/lib/errors";
import type { PaymentProvider } from "../types";
import { WompiProvider, type WompiCreds } from "./wompi";
import { MercadoPagoProvider, type MercadoPagoCreds } from "./mercadopago";
import { SimuladorProvider, simuladorHabilitado } from "./simulador";
import { ConvenioBancarioProvider } from "./convenio";

export { WompiProvider, MercadoPagoProvider, SimuladorProvider, ConvenioBancarioProvider, simuladorHabilitado };

async function wompi(conjuntoId: string | null) {
  const c = await credenciales(conjuntoId, "WOMPI");
  return c?.publicKey && c.integritySecret ? new WompiProvider(c as WompiCreds) : null;
}

async function mercadoPago(conjuntoId: string | null) {
  const c = await credenciales(conjuntoId, "MERCADOPAGO");
  return c?.accessToken ? new MercadoPagoProvider(c as MercadoPagoCreds) : null;
}

/** Proveedor de una pasarela concreta con las credenciales del conjunto (o globales). Para webhooks y conciliación. */
export async function proveedorPorPasarela(conjuntoId: string | null, pasarela: Pasarela): Promise<PaymentProvider | null> {
  if (pasarela === "WOMPI") return wompi(conjuntoId);
  if (pasarela === "MERCADOPAGO") return mercadoPago(conjuntoId);
  if (pasarela === "SIMULADOR") return simuladorHabilitado() ? new SimuladorProvider() : null;
  return new ConvenioBancarioProvider();
}

/**
 * Pasarela con la que cobra el conjunto: la configurada en `config.pagos.pasarela` si tiene credenciales;
 * si no, el simulador (solo con PAYMENTS_SIMULATOR=true); si el simulador está apagado, cualquier pasarela
 * real con credenciales.
 */
export async function proveedorConjunto(conjunto: { id: string; config: unknown }): Promise<PaymentProvider> {
  const pref = parseConfig(conjunto.config).pagos.pasarela;
  if (pref === "WOMPI") {
    const p = await wompi(conjunto.id);
    if (p) return p;
  }
  if (pref === "MERCADOPAGO") {
    const p = await mercadoPago(conjunto.id);
    if (p) return p;
  }
  if (simuladorHabilitado()) return new SimuladorProvider();
  const alterno = (await wompi(conjunto.id)) ?? (await mercadoPago(conjunto.id));
  if (alterno) return alterno;
  throw new AppError("Los pagos en línea aún no están configurados en este conjunto. Comunícate con la administración.");
}
