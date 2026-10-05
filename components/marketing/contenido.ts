import {
  BarChart3,
  Bell,
  Building2,
  CalendarCheck,
  CreditCard,
  FileSignature,
  Gavel,
  HandCoins,
  KeyRound,
  LifeBuoy,
  type LucideIcon,
  Megaphone,
  PackageCheck,
  PackageSearch,
  ShieldCheck,
  ShieldHalf,
  Sparkles,
  Users,
  Vote,
  Wrench,
} from "lucide-react";

/** Contenido del sitio comercial. Todo lo que se afirma aquí existe en el producto. */

export const SITIO = {
  nombre: "Conjunto360",
  eslogan: "Tu conjunto, en tu bolsillo",
  descripcion:
    "Software para administrar conjuntos residenciales y propiedad horizontal en Colombia: cartera y pagos en línea, portería digital, reservas, PQRS, asambleas con quórum por coeficiente y una app para cada residente.",
};

export function urlSitio(path = "") {
  return `${(process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "")}${path}`;
}

export type Utilidad = { icono: LucideIcon; titulo: string; texto: string; destacado?: boolean };

/** Utilidades principales (cuadrícula de la home). */
export const UTILIDADES: Utilidad[] = [
  { icono: HandCoins, titulo: "Cartera al día", texto: "Cuotas por coeficiente, intereses de mora sin anatocismo, pronto pago, acuerdos de pago y paz y salvo con QR verificable.", destacado: true },
  { icono: CreditCard, titulo: "Pagos en línea", texto: "PSE, tarjeta y Nequi con Wompi o Mercado Pago. El pago se aplica solo a la cuota correcta y llega el recibo al instante.", destacado: true },
  { icono: ShieldHalf, titulo: "Portería digital", texto: "Visitantes con código o QR, bitácora que no se puede alterar y control de vehículos. Sigue funcionando si se cae el internet.", destacado: true },
  { icono: PackageCheck, titulo: "Paquetería", texto: "El residente recibe aviso cuando llega su paquete y lo reclama con firma digital. Solo lo entregan a personas autorizadas." },
  { icono: CalendarCheck, titulo: "Reservas de zonas comunes", texto: "Calendario sin cruces, reglas por zona, cobro en línea con factura electrónica y check-in con acta de entrega." },
  { icono: LifeBuoy, titulo: "PQRS con radicado", texto: "Cada solicitud con número, tiempos de respuesta en días hábiles, tablero Kanban y calificación del servicio." },
  { icono: Vote, titulo: "Asambleas y votaciones", texto: "Quórum y mayorías por coeficiente según la Ley 675, poderes, asistencia con QR, voto secreto y acta firmada en PDF.", destacado: true },
  { icono: Megaphone, titulo: "Comunicación", texto: "Muro del conjunto, correo masivo por torre o segmento, notificaciones push y mensajes por WhatsApp." },
  { icono: Gavel, titulo: "Convivencia con debido proceso", texto: "Llamados de atención y multas con descargos (art. 59 Ley 675); la multa llega a cartera solo cuando queda en firme." },
  { icono: Wrench, titulo: "Mantenimiento y activos", texto: "Hoja de vida de equipos con QR, mantenimientos preventivos, órdenes de trabajo, proveedores y contratos con alertas." },
  { icono: PackageSearch, titulo: "Objetos perdidos", texto: "Reportes con foto, coincidencias automáticas entre lo perdido y lo encontrado, custodia en portería y entrega verificada." },
  { icono: KeyRound, titulo: "Acceso para todo el hogar", texto: "El titular invita a su familia, empleada o cuidador y decide qué puede hacer cada uno. Si el titular se va, sus accesos terminan solos." },
  { icono: BarChart3, titulo: "Estadísticas e informes", texto: "Indicadores de recaudo, PQRS y ocupación con comparación de periodos, historial por unidad e informe de empalme." },
  { icono: Sparkles, titulo: "Asistente con IA", texto: "Redacta respuestas a PQRS, resume actas y responde preguntas sobre la información del conjunto." },
  { icono: ShieldCheck, titulo: "Seguridad y habeas data", texto: "Datos aislados por conjunto, auditoría de cada cambio, copias de seguridad diarias y derechos ARCO de la Ley 1581." },
  { icono: Bell, titulo: "Botón de pánico", texto: "Alerta inmediata a portería y brigadistas, plan de emergencia y lista de evacuación con personas que necesitan apoyo." },
];

export type Rol = { icono: LucideIcon; titulo: string; puntos: string[] };

export const ROLES: Rol[] = [
  { icono: Building2, titulo: "Administración", puntos: ["Genera las cuotas del mes en un clic", "Concilia pagos y cartera sin Excel", "Responde PQRS dentro de los tiempos", "Prepara asambleas con quórum en vivo"] },
  { icono: FileSignature, titulo: "Consejo de administración", puntos: ["Ve recaudo, mora y presupuesto al día", "Aprueba contratos y gastos desde el celular", "Consulta actas, informes y auditoría"] },
  { icono: ShieldHalf, titulo: "Portería", puntos: ["Botones grandes, pensados para la tablet", "Valida visitantes con QR o código", "Registra paquetes y novedades del turno", "Funciona sin internet y sincroniza después"] },
  { icono: Users, titulo: "Residentes y propietarios", puntos: ["Pagan la administración en segundos", "Autorizan visitas y reservan zonas", "Reciben avisos de paquetes y comunicados", "Votan y participan desde la app"] },
];

export type Pregunta = { p: string; r: string };

export const PREGUNTAS: Pregunta[] = [
  { p: "¿Necesito instalar algo?", r: "No. Conjunto360 funciona en el navegador y se puede instalar como app en celulares Android y iPhone desde el mismo enlace, sin pasar por tiendas de aplicaciones." },
  { p: "¿Cuánto cuesta y cómo se paga?", r: "El plan Conjunto único vale $5.000.000 al año e incluye todo. El plan Multiconjunto vale $4.000.000 al año por cada conjunto, y con más de 3 conjuntos tiene un 10 % de descuento sobre el total. Todos los pagos son anuales." },
  { p: "¿Los residentes pagan algo por usar la app?", r: "No. La licencia es por conjunto e incluye usuarios ilimitados: administración, consejo, portería, propietarios, arrendatarios y sus familias." },
  { p: "¿Qué pasa si se cae el internet en la portería?", r: "La portería sigue registrando ingresos, salidas y paquetes sin conexión. Cuando vuelve el internet, todo se sincroniza solo y sin duplicados." },
  { p: "¿Puedo traer la información que tengo en Excel?", r: "Sí. Importamos unidades, coeficientes, propietarios, residentes, vehículos y saldos iniciales de cartera desde plantillas de Excel, con validación fila por fila." },
  { p: "¿Cómo protegen los datos personales?", r: "Cumplimos la Ley 1581 de 2012: consentimiento informado, política de tratamiento, derechos de consulta, corrección y supresión desde la app, datos aislados por conjunto, auditoría y copias de seguridad diarias." },
  { p: "¿Sirve para asambleas virtuales o mixtas?", r: "Sí. La asistencia se registra con QR o en línea, el quórum se calcula por coeficiente en tiempo real, se manejan poderes y, al terminar, el acta se redacta con los resultados para firmarla en pantalla y publicarla en PDF." },
  { p: "¿Cómo funciona el descuento multiconjunto?", r: "Si contratas más de 3 conjuntos en el plan Multiconjunto, se aplica un 10 % de descuento sobre el valor total de la factura anual. Por ejemplo, 4 conjuntos: $16.000.000 − 10 % = $14.400.000 al año." },
];
