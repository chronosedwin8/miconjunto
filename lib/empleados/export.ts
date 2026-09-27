import { registerExporter } from "@/lib/export/registry";
import { label } from "@/lib/labels";
import { listarEmpleados } from "./service";

registerExporter("empleados", {
  perm: "empleados.ver",
  titulo: "Empleados del conjunto",
  columns: [
    { header: "Nombre", key: "nombre", width: 30 },
    { header: "Documento", key: "documento", width: 16 },
    { header: "Cargo", key: "cargo", width: 20 },
    { header: "Turno", key: "turno", width: 22 },
    { header: "Teléfono", key: "telefono" },
    { header: "Ingreso", key: "ingreso", tipo: "fecha" },
    { header: "EPS vence", key: "eps", tipo: "fecha" },
    { header: "ARL vence", key: "arl", tipo: "fecha" },
    { header: "Seguridad social", key: "semaforo", width: 16 },
    { header: "Activo", key: "activo" },
  ],
  rows: async (ctx, sp) => {
    const { items } = await listarEmpleados(ctx, { q: sp.q, cargo: sp.cargo, estado: sp.estado, alerta: sp.alerta });
    return items.map((e) => ({
      nombre: e.nombre,
      documento: e.documento,
      cargo: e.cargo,
      turno: e.turno,
      telefono: e.telefono,
      ingreso: e.fechaIngreso,
      eps: e.epsVence,
      arl: e.arlVence,
      semaforo: label(e.semaforo),
      activo: e.activo ? "Sí" : "No",
    }));
  },
});
