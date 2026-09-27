import { z } from "zod";
import { apiHandler } from "@/lib/api/handler";
import { ingresoPorAutorizacion, registrarIngreso } from "@/lib/porteria/service";

const opt = z.string().trim().max(500).nullish();

/**
 * POST /api/v1/porteria/ingresos — registra un ingreso (integraciones: cámaras LPR, cerraduras, torniquetes).
 * Con `codigo` (6 dígitos) o `token` (QR) valida la autorización del residente; si no, registra un ingreso manual.
 * `clienteId` opcional para idempotencia.
 */
export const POST = apiHandler(
  {
    perm: "porteria.registrar",
    schema: z.object({
      codigo: opt,
      token: opt,
      sujeto: z.enum(["VISITANTE", "RESIDENTE", "EMPLEADO", "VEHICULO", "PROVEEDOR", "DOMICILIARIO"]).default("VISITANTE"),
      nombre: opt,
      documento: opt,
      unidadId: opt,
      placa: opt,
      parqueaderoId: opt,
      fotoUrl: opt,
      observaciones: opt,
      clienteId: opt,
      hora: opt,
    }),
  },
  async ({ ctx, input }) => {
    if (input.codigo || input.token) return ingresoPorAutorizacion(ctx, input);
    return registrarIngreso(ctx, { ...input, nombre: input.nombre ?? input.placa ?? "", medio: "MANUAL" });
  },
);
