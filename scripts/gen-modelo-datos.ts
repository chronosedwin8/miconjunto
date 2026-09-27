/** Genera docs/MODELO_DATOS.md a partir del esquema Prisma (DMMF). */
import fs from "node:fs";
import { Prisma } from "@prisma/client";

const GRUPOS: [string, string[]][] = [
  ["SaaS", ["PlanSuscripcion", "Suscripcion", "CobroSuscripcion"]],
  ["Núcleo y estructura física", ["Conjunto", "Torre", "Unidad", "HistorialCoeficiente", "Parqueadero", "Bodega", "ZonaComun", "BloqueoZona", "ReglaReserva"]],
  ["Usuarios, roles y acceso", ["Usuario", "MembresiaConjunto", "Rol", "Permiso", "RolPermiso", "TokenVerificacion", "Invitacion", "SuscripcionPush", "TokenApi", "WebhookSaliente", "EntregaWebhook"]],
  ["Personas", ["Persona", "VinculoUnidad", "Vehiculo", "Mascota", "BorradorFormulario"]],
  ["Cartera y recaudo", ["ConceptoCobro", "Cuota", "CuotaExtraordinaria", "CatalogoInfraccion", "Multa", "Pago", "AplicacionPago", "AcuerdoPago", "MovimientoCartera", "CertificadoPazYSalvo", "CuentaBancaria", "ConciliacionBancaria", "LineaExtracto", "GestionCobro", "Consecutivo", "TasaMora"]],
  ["Reservas y facturación", ["Reserva", "FacturaElectronica", "TablaReferencia"]],
  ["Portería", ["Visitante", "AutorizacionIngreso", "SolicitudIngreso", "RegistroAcceso", "TurnoPorteria", "Novedad", "Paquete", "LlaveElemento", "PrestamoElemento", "AlertaEmergencia"]],
  ["Comunicaciones", ["Segmento", "Publicacion", "ComentarioPublicacion", "ReaccionPublicacion", "LecturaPublicacion", "CampanaCorreo", "CorreoSaliente", "Notificacion", "Encuesta", "PreguntaEncuesta", "RespuestaEncuesta", "CarpetaDocumento", "Documento", "VersionDocumento", "AcuseDocumento", "EventoCalendario", "ObjetoPerdido"]],
  ["PQRS y convivencia", ["Ticket", "ComentarioTicket", "PlantillaRespuesta", "LlamadoAtencion", "IncidenteConvivencia", "SolicitudObra", "Mudanza"]],
  ["Gobierno", ["Asamblea", "AsistenciaAsamblea", "PoderAsamblea", "Votacion", "Voto", "MiembroConsejo", "ReunionConsejo"]],
  ["Activos, mantenimiento y proveedores", ["Activo", "PlanMantenimiento", "OrdenTrabajo", "Proveedor", "DocumentoProveedor", "CalificacionProveedor", "Contrato", "Presupuesto", "RubroPresupuesto", "Gasto", "Empleado"]],
  ["Emergencias", ["PlanEmergencia", "Brigadista", "Simulacro"]],
  ["Transversales", ["Auditoria", "Adjunto", "ImportacionApertura", "ConfiguracionIntegracion", "Backup", "ConsultaIA"]],
];

const models = new Map(Prisma.dmmf.datamodel.models.map((m) => [m.name, m]));
let out = `# Modelo de datos\n\nGenerado desde \`prisma/schema.prisma\` con \`npx tsx scripts/gen-modelo-datos.ts\`. ${models.size} modelos, ${Prisma.dmmf.datamodel.enums.length} enums.\n\n`;
out += `**Convenciones:** \`id\` (cuid), \`createdAt\`, \`updatedAt\`, \`deletedAt\` (borrado lógico) en todos los modelos. Los modelos marcados con 🏢 tienen \`conjuntoId\` obligatorio e indexado y quedan aislados automáticamente por \`withTenant\`.\n\n`;
const vistos = new Set<string>();
for (const [grupo, nombres] of GRUPOS) {
  out += `## ${grupo}\n\n`;
  for (const n of nombres) {
    const m = models.get(n);
    if (!m) continue;
    vistos.add(n);
    const tenant = m.fields.some((f) => f.name === "conjuntoId" && f.isRequired);
    out += `### ${n}${tenant ? " 🏢" : ""}\n\n| Campo | Tipo | Notas |\n|---|---|---|\n`;
    for (const f of m.fields) {
      if (["createdAt", "updatedAt", "deletedAt"].includes(f.name)) continue;
      const tipo = `${f.type}${f.isList ? "[]" : ""}${f.isRequired ? "" : "?"}`;
      const notas = [f.isId ? "PK" : "", f.isUnique ? "único" : "", f.kind === "object" ? "relación" : "", f.kind === "enum" ? "enum" : "", f.hasDefaultValue && f.kind !== "object" ? `por defecto ${JSON.stringify(typeof f.default === "object" ? (f.default as { name?: string })?.name ?? "" : f.default)}` : ""]
        .filter(Boolean)
        .join(", ");
      out += `| ${f.name} | ${tipo} | ${notas} |\n`;
    }
    const uniques = m.uniqueFields.map((u) => u.join(" + "));
    if (uniques.length) out += `\nÚnicos compuestos: ${uniques.join("; ")}\n`;
    out += "\n";
  }
}
const resto = [...models.keys()].filter((k) => !vistos.has(k));
if (resto.length) out += `## Otros\n\n${resto.join(", ")}\n\n`;
out += `## Enums\n\n`;
for (const e of Prisma.dmmf.datamodel.enums) out += `- **${e.name}**: ${e.values.map((v) => v.name).join(", ")}\n`;
fs.writeFileSync("docs/MODELO_DATOS.md", out);
console.log("docs/MODELO_DATOS.md generado");
