import Link from "next/link";
import { prisma } from "@/lib/db";
import { parseConfig } from "@/lib/conjunto/config";

export const metadata = { title: "Política de tratamiento de datos personales" };

type SP = Promise<Record<string, string | string[] | undefined>>;

/** Política pública (sin sesión). Con ?c=<slug> muestra responsable, finalidad y texto propio del conjunto. */
export default async function PoliticaDatosPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const slug = typeof sp.c === "string" ? sp.c.slice(0, 80) : undefined;
  const conjunto = slug ? await prisma.conjunto.findFirst({ where: { slug, deletedAt: null }, select: { nombre: true, nit: true, direccion: true, ciudad: true, email: true, telefono: true, config: true } }) : null;
  const datos = conjunto ? parseConfig(conjunto.config).datos : null;
  return (
    <main className="mx-auto max-w-3xl px-4 py-8 text-[15px] leading-relaxed">
      <p className="mb-2 text-sm text-muted-foreground">
        <Link href="/login" className="underline">
          MiConjunto
        </Link>
      </p>
      <h1 className="text-2xl font-bold">Política de tratamiento de datos personales</h1>
      <p className="mt-1 text-sm text-muted-foreground">Ley 1581 de 2012, Decreto 1377 de 2013 (compilado en el Decreto 1074 de 2015){datos && ` · versión ${datos.politicaVersion}`}</p>

      {conjunto && datos && (
        <section className="mt-6 space-y-2 rounded-xl border bg-card p-4">
          <h2 className="text-lg font-semibold">{conjunto.nombre}</h2>
          <p>
            <b>Responsable del tratamiento:</b> {datos.responsable} de {conjunto.nombre}
            {conjunto.nit && `, NIT ${conjunto.nit}`}
            {conjunto.direccion && `, ${conjunto.direccion}`}
            {conjunto.ciudad && `, ${conjunto.ciudad}`}.
          </p>
          <p>
            <b>Canal de atención:</b> {datos.emailContacto || conjunto.email || "la administración del conjunto"}
            {conjunto.telefono && ` · ${conjunto.telefono}`}.
          </p>
          <p>
            <b>Finalidad:</b> {datos.finalidad}
          </p>
          {datos.politicaTexto && <div className="whitespace-pre-line border-t pt-3">{datos.politicaTexto}</div>}
        </section>
      )}

      <section className="mt-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold">1. Quiénes tratan tus datos</h2>
          <p>
            El <b>responsable</b> es la persona jurídica de la propiedad horizontal (el conjunto o edificio) donde tienes tu unidad, representada por su administración. <b>MiConjunto</b> actúa como <b>encargado</b> del
            tratamiento: provee la plataforma tecnológica y solo trata los datos siguiendo las instrucciones del responsable.
          </p>
        </div>
        <div>
          <h2 className="text-lg font-semibold">2. Qué datos tratamos</h2>
          <ul className="list-disc space-y-1 pl-6">
            <li>Identificación: nombres, apellidos, tipo y número de documento, fecha de nacimiento y foto.</li>
            <li>Contacto: correo electrónico y número de celular.</li>
            <li>Vivienda: unidades, tipo de vínculo (propietario, arrendatario, familiar, empleado), vehículos y mascotas.</li>
            <li>Datos financieros de la unidad: cuotas, pagos y estado de cuenta (solo propietarios y autorizados).</li>
            <li>
              <b>Datos sensibles</b> (opcionales): condición de movilidad reducida, tipo de sangre, EPS y contacto de emergencia, usados exclusivamente para atender emergencias. No estás obligado a
              suministrarlos.
            </li>
            <li>Datos de menores de edad: se tratan respetando su interés superior y sus derechos prevalentes, con autorización de su representante legal.</li>
            <li>Registros de acceso: ingresos y salidas en portería, videovigilancia y bitácora, por seguridad.</li>
          </ul>
        </div>
        <div>
          <h2 className="text-lg font-semibold">3. Para qué los usamos</h2>
          <p>
            Administración de la copropiedad (Ley 675 de 2001), control de acceso y seguridad, cobro de expensas comunes, reservas de zonas comunes, comunicaciones con copropietarios y residentes, atención de
            PQRS, asambleas y votaciones, y atención de emergencias. No vendemos ni cedemos tus datos a terceros con fines comerciales.
          </p>
        </div>
        <div>
          <h2 className="text-lg font-semibold">4. Tus derechos</h2>
          <p>Como titular puedes, en cualquier momento y sin costo:</p>
          <ul className="list-disc space-y-1 pl-6">
            <li>Conocer, actualizar y rectificar tus datos.</li>
            <li>Solicitar prueba de la autorización otorgada.</li>
            <li>Ser informado sobre el uso que se ha dado a tus datos.</li>
            <li>Revocar la autorización y solicitar la supresión de tus datos cuando no exista un deber legal o contractual de conservarlos.</li>
            <li>Presentar quejas ante la Superintendencia de Industria y Comercio.</li>
          </ul>
          <p className="mt-2">
            En la app puedes ejercerlos desde <b>Mi perfil → Privacidad</b>: descargar tus datos en formato JSON, corregirlos o solicitar su supresión (anonimización). Las consultas se atienden en máximo 10
            días hábiles y los reclamos en máximo 15 días hábiles.
          </p>
        </div>
        <div>
          <h2 className="text-lg font-semibold">5. Conservación y seguridad</h2>
          <p>
            Conservamos los datos mientras exista tu vínculo con la copropiedad y por el tiempo que exijan las normas contables y de propiedad horizontal. Al retirarte, tus datos personales se anonimizan. Las
            contraseñas se guardan cifradas, el acceso se controla por roles y permisos y cada operación sensible queda auditada.
          </p>
        </div>
        <div>
          <h2 className="text-lg font-semibold">6. Cambios a esta política</h2>
          <p>Cuando la política cambie te pediremos aceptarla de nuevo en la app antes de seguir tratando tus datos para las nuevas finalidades.</p>
        </div>
      </section>
    </main>
  );
}
