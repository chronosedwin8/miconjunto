-- CreateEnum
CREATE TYPE "TipoConjunto" AS ENUM ('EDIFICIO', 'CONJUNTO_CASAS', 'MIXTO');

-- CreateEnum
CREATE TYPE "EstadoConjunto" AS ENUM ('ACTIVO', 'SUSPENDIDO', 'EN_APERTURA', 'INACTIVO');

-- CreateEnum
CREATE TYPE "TipoUnidad" AS ENUM ('APARTAMENTO', 'CASA', 'LOCAL', 'OFICINA', 'DEPOSITO', 'PARQUEADERO');

-- CreateEnum
CREATE TYPE "EstadoOcupacion" AS ENUM ('PROPIETARIO_OCUPA', 'ARRENDADA', 'AIRBNB_O_SIMILAR', 'DESOCUPADA', 'EN_VENTA');

-- CreateEnum
CREATE TYPE "TipoParqueadero" AS ENUM ('PRIVADO', 'COMUN', 'VISITANTES', 'MOTO', 'BICICLETA', 'DISCAPACIDAD');

-- CreateEnum
CREATE TYPE "EstadoEspacio" AS ENUM ('DISPONIBLE', 'ASIGNADO', 'OCUPADO', 'FUERA_SERVICIO');

-- CreateEnum
CREATE TYPE "CategoriaZona" AS ENUM ('SALON', 'PISCINA', 'GIMNASIO', 'BBQ', 'CANCHA', 'JUEGOS', 'TERRAZA', 'SALA_JUNTAS', 'COWORKING', 'OTRA');

-- CreateEnum
CREATE TYPE "EstadoZona" AS ENUM ('ACTIVA', 'MANTENIMIENTO', 'INACTIVA');

-- CreateEnum
CREATE TYPE "EstadoUsuario" AS ENUM ('ACTIVO', 'INVITADO', 'BLOQUEADO', 'INACTIVO');

-- CreateEnum
CREATE TYPE "EstadoMembresia" AS ENUM ('ACTIVA', 'PENDIENTE', 'SUSPENDIDA');

-- CreateEnum
CREATE TYPE "TipoDocumento" AS ENUM ('CC', 'CE', 'TI', 'RC', 'PA', 'NIT', 'PEP', 'PPT');

-- CreateEnum
CREATE TYPE "TipoVinculo" AS ENUM ('PROPIETARIO', 'COPROPIETARIO', 'ARRENDATARIO', 'RESIDENTE', 'FAMILIAR', 'EMPLEADO_DOMESTICO', 'CUIDADOR', 'VISITANTE_FRECUENTE', 'AUTORIZADO_RECOGER_PAQUETES', 'AUTORIZADO_MENORES');

-- CreateEnum
CREATE TYPE "EstadoVinculo" AS ENUM ('PENDIENTE_APROBACION', 'ACTIVO', 'INACTIVO', 'RECHAZADO');

-- CreateEnum
CREATE TYPE "TipoVehiculo" AS ENUM ('CARRO', 'MOTO', 'BICICLETA', 'OTRO');

-- CreateEnum
CREATE TYPE "TipoConcepto" AS ENUM ('ADMINISTRACION', 'EXTRAORDINARIA', 'MULTA', 'INTERES_MORA', 'ALQUILER_ZONA', 'PARQUEADERO', 'SERVICIO', 'OTRO');

-- CreateEnum
CREATE TYPE "EstadoCuota" AS ENUM ('PENDIENTE', 'PARCIAL', 'PAGADA', 'ANULADA', 'EN_ACUERDO');

-- CreateEnum
CREATE TYPE "OrigenCuota" AS ENUM ('GENERACION_MENSUAL', 'MANUAL', 'RESERVA', 'MULTA', 'ASAMBLEA', 'APERTURA', 'INTERES');

-- CreateEnum
CREATE TYPE "DistribucionCuota" AS ENUM ('POR_COEFICIENTE', 'IGUAL_POR_UNIDAD', 'MANUAL');

-- CreateEnum
CREATE TYPE "EstadoMulta" AS ENUM ('PROPUESTA', 'NOTIFICADA', 'EN_DESCARGOS', 'RATIFICADA', 'REVOCADA', 'PAGADA');

-- CreateEnum
CREATE TYPE "MedioPago" AS ENUM ('PSE', 'TARJETA', 'NEQUI', 'BANCOLOMBIA_QR', 'EFECTIVO', 'TRANSFERENCIA', 'CONSIGNACION', 'PASARELA');

-- CreateEnum
CREATE TYPE "Pasarela" AS ENUM ('WOMPI', 'MERCADOPAGO', 'SIMULADOR', 'NINGUNA');

-- CreateEnum
CREATE TYPE "EstadoPago" AS ENUM ('PENDIENTE', 'APROBADO', 'RECHAZADO', 'ANULADO');

-- CreateEnum
CREATE TYPE "EstadoAcuerdo" AS ENUM ('VIGENTE', 'CUMPLIDO', 'INCUMPLIDO', 'ANULADO');

-- CreateEnum
CREATE TYPE "TipoMovimiento" AS ENUM ('DEBITO', 'CREDITO');

-- CreateEnum
CREATE TYPE "EstadoCertificado" AS ENUM ('VIGENTE', 'VENCIDO', 'ANULADO');

-- CreateEnum
CREATE TYPE "EstadoLineaExtracto" AS ENUM ('PENDIENTE', 'EMPAREJADA', 'CREADA', 'IGNORADA');

-- CreateEnum
CREATE TYPE "CanalCobro" AS ENUM ('LLAMADA', 'CORREO', 'VISITA', 'WHATSAPP', 'CARTA', 'SMS');

-- CreateEnum
CREATE TYPE "EstadoReserva" AS ENUM ('SOLICITADA', 'APROBADA', 'RECHAZADA', 'CANCELADA', 'CUMPLIDA', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "EstadoFactura" AS ENUM ('PENDIENTE', 'EN_PROCESO', 'VALIDADA', 'ERROR', 'ANULADA');

-- CreateEnum
CREATE TYPE "TipoDocumentoElectronico" AS ENUM ('FACTURA', 'NOTA_CREDITO');

-- CreateEnum
CREATE TYPE "TipoVisitante" AS ENUM ('VISITA', 'DOMICILIO', 'PROVEEDOR', 'TECNICO', 'TRANSPORTE', 'CONTRATISTA', 'OTRO');

-- CreateEnum
CREATE TYPE "EstadoAutorizacion" AS ENUM ('ACTIVA', 'USADA', 'VENCIDA', 'REVOCADA');

-- CreateEnum
CREATE TYPE "EstadoSolicitudIngreso" AS ENUM ('PENDIENTE', 'AUTORIZADA', 'RECHAZADA', 'EXPIRADA', 'DECISION_TELEFONICA');

-- CreateEnum
CREATE TYPE "TipoRegistroAcceso" AS ENUM ('INGRESO', 'SALIDA', 'ANULACION');

-- CreateEnum
CREATE TYPE "SujetoAcceso" AS ENUM ('VISITANTE', 'RESIDENTE', 'EMPLEADO', 'VEHICULO', 'PROVEEDOR', 'DOMICILIARIO');

-- CreateEnum
CREATE TYPE "MedioAcceso" AS ENUM ('QR', 'CODIGO', 'LLAMADA_RESIDENTE', 'LISTA_FRECUENTES', 'MANUAL');

-- CreateEnum
CREATE TYPE "EstadoTurno" AS ENUM ('ABIERTO', 'CERRADO');

-- CreateEnum
CREATE TYPE "TipoNovedad" AS ENUM ('RUIDO', 'DANO', 'EMERGENCIA', 'INCIDENTE', 'SEGURIDAD', 'SERVICIOS', 'OTRO');

-- CreateEnum
CREATE TYPE "Severidad" AS ENUM ('BAJA', 'MEDIA', 'ALTA', 'CRITICA');

-- CreateEnum
CREATE TYPE "TipoPaquete" AS ENUM ('SOBRE', 'CAJA', 'MERCADO', 'DOMICILIO', 'OTRO');

-- CreateEnum
CREATE TYPE "EstadoPaquete" AS ENUM ('EN_PORTERIA', 'ENTREGADO', 'DEVUELTO');

-- CreateEnum
CREATE TYPE "TipoElemento" AS ENUM ('LLAVE', 'CONTROL', 'TARJETA', 'RADIO', 'OTRO');

-- CreateEnum
CREATE TYPE "EstadoElemento" AS ENUM ('DISPONIBLE', 'PRESTADO', 'PERDIDO');

-- CreateEnum
CREATE TYPE "TipoAlerta" AS ENUM ('PANICO', 'EMERGENCIA_GENERAL', 'INCENDIO', 'SISMO', 'MEDICA', 'SEGURIDAD');

-- CreateEnum
CREATE TYPE "EstadoAlerta" AS ENUM ('ACTIVA', 'ATENDIDA', 'FALSA_ALARMA');

-- CreateEnum
CREATE TYPE "CategoriaPublicacion" AS ENUM ('AVISO', 'NOTICIA', 'EVENTO', 'EMERGENCIA', 'CLASIFICADO', 'PERDIDO_ENCONTRADO');

-- CreateEnum
CREATE TYPE "EstadoPublicacion" AS ENUM ('BORRADOR', 'PENDIENTE_MODERACION', 'PUBLICADA', 'RECHAZADA', 'ARCHIVADA');

-- CreateEnum
CREATE TYPE "TipoCampana" AS ENUM ('GENERAL', 'COBRO_ADMINISTRACION');

-- CreateEnum
CREATE TYPE "EstadoCampana" AS ENUM ('BORRADOR', 'PROGRAMADA', 'ENVIANDO', 'ENVIADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "EstadoCorreo" AS ENUM ('PENDIENTE', 'ENVIADO', 'ERROR', 'CANCELADO');

-- CreateEnum
CREATE TYPE "TipoPregunta" AS ENUM ('UNICA', 'MULTIPLE', 'ESCALA', 'TEXTO');

-- CreateEnum
CREATE TYPE "EstadoEncuesta" AS ENUM ('BORRADOR', 'ABIERTA', 'CERRADA');

-- CreateEnum
CREATE TYPE "CategoriaDocumento" AS ENUM ('REGLAMENTO', 'MANUAL_CONVIVENCIA', 'ACTA', 'PRESUPUESTO', 'ESTADO_FINANCIERO', 'POLIZA', 'CONTRATO', 'CIRCULAR', 'OTRO');

-- CreateEnum
CREATE TYPE "TipoEvento" AS ENUM ('COMUNITARIO', 'ASAMBLEA', 'MANTENIMIENTO', 'FUMIGACION', 'CORTE_SERVICIO', 'OTRO');

-- CreateEnum
CREATE TYPE "TipoObjetoPerdido" AS ENUM ('PERDIDO', 'ENCONTRADO');

-- CreateEnum
CREATE TYPE "EstadoObjetoPerdido" AS ENUM ('ABIERTO', 'DEVUELTO', 'CERRADO');

-- CreateEnum
CREATE TYPE "TipoTicket" AS ENUM ('PETICION', 'QUEJA', 'RECLAMO', 'SUGERENCIA', 'FELICITACION', 'DANO_ZONA_COMUN', 'DANO_UNIDAD', 'SEGURIDAD', 'RUIDO', 'MASCOTAS', 'OTRO');

-- CreateEnum
CREATE TYPE "PrioridadTicket" AS ENUM ('BAJA', 'MEDIA', 'ALTA', 'URGENTE');

-- CreateEnum
CREATE TYPE "EstadoTicket" AS ENUM ('ABIERTO', 'EN_REVISION', 'ASIGNADO', 'EN_PROCESO', 'EN_ESPERA_RESIDENTE', 'RESUELTO', 'CERRADO', 'REABIERTO');

-- CreateEnum
CREATE TYPE "OrigenTicket" AS ENUM ('APP', 'PORTERIA', 'PUBLICO', 'NOVEDAD', 'ACTIVO_QR');

-- CreateEnum
CREATE TYPE "TipoComentarioTicket" AS ENUM ('COMENTARIO', 'CAMBIO_ESTADO', 'ASIGNACION', 'SISTEMA');

-- CreateEnum
CREATE TYPE "GravedadLlamado" AS ENUM ('LEVE', 'MODERADA', 'GRAVE');

-- CreateEnum
CREATE TYPE "EstadoLlamado" AS ENUM ('ENVIADO', 'LEIDO', 'RESPONDIDO', 'CERRADO', 'ESCALADO_MULTA');

-- CreateEnum
CREATE TYPE "EstadoIncidente" AS ENUM ('ABIERTO', 'EN_MEDIACION', 'ACUERDO', 'CERRADO', 'ESCALADO');

-- CreateEnum
CREATE TYPE "EstadoSolicitud" AS ENUM ('SOLICITADA', 'APROBADA', 'RECHAZADA', 'EN_CURSO', 'FINALIZADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "TipoMudanza" AS ENUM ('INGRESO', 'SALIDA');

-- CreateEnum
CREATE TYPE "TipoAsamblea" AS ENUM ('ORDINARIA', 'EXTRAORDINARIA');

-- CreateEnum
CREATE TYPE "ModalidadAsamblea" AS ENUM ('PRESENCIAL', 'VIRTUAL', 'MIXTA');

-- CreateEnum
CREATE TYPE "EstadoAsamblea" AS ENUM ('BORRADOR', 'CONVOCADA', 'EN_CURSO', 'FINALIZADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "TipoAsistencia" AS ENUM ('PRESENCIAL', 'VIRTUAL', 'PODER');

-- CreateEnum
CREATE TYPE "EstadoPoder" AS ENUM ('PENDIENTE', 'APROBADO', 'RECHAZADO');

-- CreateEnum
CREATE TYPE "TipoMayoria" AS ENUM ('SIMPLE', 'CALIFICADA_70', 'UNANIME');

-- CreateEnum
CREATE TYPE "Ponderacion" AS ENUM ('COEFICIENTE', 'UNIDAD');

-- CreateEnum
CREATE TYPE "QuienVota" AS ENUM ('PROPIETARIOS_AL_DIA', 'PROPIETARIOS', 'TODOS');

-- CreateEnum
CREATE TYPE "EstadoVotacion" AS ENUM ('BORRADOR', 'ABIERTA', 'CERRADA', 'ANULADA');

-- CreateEnum
CREATE TYPE "CargoConsejo" AS ENUM ('PRESIDENTE', 'SECRETARIO', 'VOCAL', 'SUPLENTE');

-- CreateEnum
CREATE TYPE "EstadoActivo" AS ENUM ('OPERATIVO', 'EN_MANTENIMIENTO', 'FUERA_SERVICIO', 'DADO_DE_BAJA');

-- CreateEnum
CREATE TYPE "TipoMantenimiento" AS ENUM ('PREVENTIVO', 'CORRECTIVO', 'LEGAL');

-- CreateEnum
CREATE TYPE "OrigenOrden" AS ENUM ('PLAN', 'TICKET', 'MANUAL');

-- CreateEnum
CREATE TYPE "EstadoOrden" AS ENUM ('PENDIENTE', 'PROGRAMADA', 'EN_PROCESO', 'COMPLETADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "TipoDocProveedor" AS ENUM ('RUT', 'CAMARA_COMERCIO', 'POLIZA', 'SEGURIDAD_SOCIAL', 'CERTIFICACION', 'OTRO');

-- CreateEnum
CREATE TYPE "EstadoContrato" AS ENUM ('VIGENTE', 'POR_VENCER', 'VENCIDO', 'TERMINADO');

-- CreateEnum
CREATE TYPE "EstadoPresupuesto" AS ENUM ('BORRADOR', 'APROBADO', 'CERRADO');

-- CreateEnum
CREATE TYPE "TipoRubro" AS ENUM ('INGRESO', 'GASTO');

-- CreateEnum
CREATE TYPE "EstadoGasto" AS ENUM ('PENDIENTE_APROBACION', 'APROBADO', 'RECHAZADO', 'PAGADO');

-- CreateEnum
CREATE TYPE "TipoToken" AS ENUM ('MAGIC_LINK', 'RESET_PASSWORD', 'OTP', 'PAGO_PUBLICO');

-- CreateEnum
CREATE TYPE "EstadoInvitacion" AS ENUM ('PENDIENTE', 'ACEPTADA', 'VENCIDA', 'REVOCADA');

-- CreateEnum
CREATE TYPE "TipoIntegracion" AS ENUM ('WOMPI', 'MERCADOPAGO', 'FACTUS', 'ALANUBE', 'SMTP', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "EstadoImportacion" AS ENUM ('VALIDANDO', 'CON_ERRORES', 'APLICADA', 'FALLIDA');

-- CreateEnum
CREATE TYPE "EstadoSuscripcion" AS ENUM ('ACTIVA', 'PRUEBA', 'VENCIDA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "RolBrigadista" AS ENUM ('COORDINADOR', 'PRIMEROS_AUXILIOS', 'EVACUACION', 'CONTRA_INCENDIO');

-- CreateTable
CREATE TABLE "PlanSuscripcion" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "precioMensual" DECIMAL(14,2) NOT NULL,
    "precioUnidad" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "maxUnidades" INTEGER NOT NULL,
    "modulos" TEXT[],
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "PlanSuscripcion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Suscripcion" (
    "id" TEXT NOT NULL,
    "conjuntoId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "estado" "EstadoSuscripcion" NOT NULL DEFAULT 'ACTIVA',
    "inicio" TIMESTAMP(3) NOT NULL,
    "fin" TIMESTAMP(3),
    "valor" DECIMAL(14,2) NOT NULL,
    "notas" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Suscripcion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CobroSuscripcion" (
    "id" TEXT NOT NULL,
    "suscripcionId" TEXT NOT NULL,
    "periodo" TEXT NOT NULL,
    "valor" DECIMAL(14,2) NOT NULL,
    "pagado" BOOLEAN NOT NULL DEFAULT false,
    "pagadoEn" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "CobroSuscripcion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conjunto" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "nit" TEXT,
    "digitoVerificacion" TEXT,
    "direccion" TEXT,
    "municipioCodigo" TEXT,
    "ciudad" TEXT,
    "departamento" TEXT,
    "telefono" TEXT,
    "email" TEXT,
    "logoUrl" TEXT,
    "colorPrimario" TEXT DEFAULT '#0f766e',
    "regimenTributario" TEXT,
    "responsableIva" BOOLEAN NOT NULL DEFAULT false,
    "tipo" "TipoConjunto" NOT NULL DEFAULT 'MIXTO',
    "matriculaInmobiliaria" TEXT,
    "personeriaJuridica" TEXT,
    "fechaInicioOperacion" TIMESTAMP(3),
    "planId" TEXT,
    "estado" "EstadoConjunto" NOT NULL DEFAULT 'ACTIVO',
    "config" JSONB NOT NULL DEFAULT '{}',
    "paginaPublica" BOOLEAN NOT NULL DEFAULT false,
    "descripcionPublica" TEXT,
    "modulosActivos" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Conjunto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Torre" (
    "id" TEXT NOT NULL,
    "conjuntoId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "pisos" INTEGER NOT NULL DEFAULT 1,
    "unidadesPorPiso" INTEGER,
    "ascensores" BOOLEAN NOT NULL DEFAULT false,
    "notas" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Torre_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Unidad" (
    "id" TEXT NOT NULL,
    "conjuntoId" TEXT NOT NULL,
    "torreId" TEXT,
    "codigo" TEXT NOT NULL,
    "tipo" "TipoUnidad" NOT NULL DEFAULT 'APARTAMENTO',
    "piso" INTEGER,
    "areaPrivada" DECIMAL(10,2),
    "areaConstruida" DECIMAL(10,2),
    "coeficiente" DECIMAL(9,6) NOT NULL,
    "matriculaInmobiliaria" TEXT,
    "numeroCatastral" TEXT,
    "estrato" INTEGER,
    "habitaciones" INTEGER,
    "banos" INTEGER,
    "balconTerraza" BOOLEAN NOT NULL DEFAULT false,
    "estadoOcupacion" "EstadoOcupacion" NOT NULL DEFAULT 'PROPIETARIO_OCUPA',
    "plataformaRentaCorta" TEXT,
    "registroRnt" TEXT,
    "cuotaAdministracion" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "notasEstructura" TEXT,
    "medidores" JSONB NOT NULL DEFAULT '{}',
    "tienePersonaMovilidadReducida" BOOLEAN NOT NULL DEFAULT false,
    "requiereAsistenciaEvacuacion" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Unidad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HistorialCoeficiente" (
    "id" TEXT NOT NULL,
    "conjuntoId" TEXT NOT NULL,
    "unidadId" TEXT NOT NULL,
    "anterior" DECIMAL(9,6) NOT NULL,
    "nuevo" DECIMAL(9,6) NOT NULL,
    "motivo" TEXT,
    "usuarioId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "HistorialCoeficiente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Parqueadero" (
    "id" TEXT NOT NULL,
    "conjuntoId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "tipo" "TipoParqueadero" NOT NULL DEFAULT 'PRIVADO',
    "ubicacion" TEXT,
    "unidadId" TEXT,
    "estado" "EstadoEspacio" NOT NULL DEFAULT 'DISPONIBLE',
    "tarifaHora" DECIMAL(14,2),
    "tarifaDia" DECIMAL(14,2),
    "notas" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Parqueadero_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bodega" (
    "id" TEXT NOT NULL,
    "conjuntoId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "ubicacion" TEXT,
    "area" DECIMAL(10,2),
    "unidadId" TEXT,
    "estado" "EstadoEspacio" NOT NULL DEFAULT 'DISPONIBLE',
    "notas" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Bodega_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ZonaComun" (
    "id" TEXT NOT NULL,
    "conjuntoId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" TEXT,
    "categoria" "CategoriaZona" NOT NULL DEFAULT 'OTRA',
    "descripcion" TEXT,
    "fotos" TEXT[],
    "capacidad" INTEGER,
    "horario" JSONB NOT NULL DEFAULT '{}',
    "reservable" BOOLEAN NOT NULL DEFAULT true,
    "requiereAprobacion" BOOLEAN NOT NULL DEFAULT false,
    "tarifa" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "deposito" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "duracionMinimaMin" INTEGER NOT NULL DEFAULT 60,
    "duracionMaximaMin" INTEGER NOT NULL DEFAULT 240,
    "anticipacionMinimaHoras" INTEGER NOT NULL DEFAULT 24,
    "anticipacionMaximaDias" INTEGER NOT NULL DEFAULT 60,
    "maxReservasMesUnidad" INTEGER NOT NULL DEFAULT 4,
    "reglasUso" TEXT,
    "bloqueoPorMora" BOOLEAN NOT NULL DEFAULT true,
    "gravaIva" BOOLEAN NOT NULL DEFAULT false,
    "tarifaIva" DECIMAL(5,2) NOT NULL DEFAULT 19,
    "generaFactura" BOOLEAN NOT NULL DEFAULT false,
    "politicaCancelacion" TEXT,
    "horasCancelacionReembolso" INTEGER NOT NULL DEFAULT 48,
    "estado" "EstadoZona" NOT NULL DEFAULT 'ACTIVA',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ZonaComun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BloqueoZona" (
    "id" TEXT NOT NULL,
    "conjuntoId" TEXT NOT NULL,
    "zonaId" TEXT NOT NULL,
    "inicio" TIMESTAMP(3) NOT NULL,
    "fin" TIMESTAMP(3) NOT NULL,
    "motivo" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'MANTENIMIENTO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "BloqueoZona_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReglaReserva" (
    "id" TEXT NOT NULL,
    "conjuntoId" TEXT NOT NULL,
    "zonaId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "valor" JSONB NOT NULL DEFAULT '{}',
    "descripcion" TEXT,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ReglaReserva_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Usuario" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "telefono" TEXT,
    "passwordHash" TEXT,
    "nombre" TEXT NOT NULL,
    "fotoUrl" TEXT,
    "estado" "EstadoUsuario" NOT NULL DEFAULT 'ACTIVO',
    "ultimoAcceso" TIMESTAMP(3),
    "preferenciasNotif" JSONB NOT NULL DEFAULT '{"push":true,"email":true,"whatsapp":false}',
    "politicaAceptadaEn" TIMESTAMP(3),
    "politicaVersion" TEXT,
    "mfaSecret" TEXT,
    "mfaActivo" BOOLEAN NOT NULL DEFAULT false,
    "esSuperAdmin" BOOLEAN NOT NULL DEFAULT false,
    "intentosFallidos" INTEGER NOT NULL DEFAULT 0,
    "bloqueadoHasta" TIMESTAMP(3),
    "sessionVersion" INTEGER NOT NULL DEFAULT 0,
    "textoGrande" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MembresiaConjunto" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "conjuntoId" TEXT NOT NULL,
    "rolId" TEXT NOT NULL,
    "personaId" TEXT,
    "estado" "EstadoMembresia" NOT NULL DEFAULT 'ACTIVA',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "MembresiaConjunto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rol" (
    "id" TEXT NOT NULL,
    "conjuntoId" TEXT NOT NULL,
    "clave" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "base" BOOLEAN NOT NULL DEFAULT false,
    "basadoEnClave" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Rol_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permiso" (
    "id" TEXT NOT NULL,
    "clave" TEXT NOT NULL,
    "modulo" TEXT NOT NULL,
    "accion" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'ACCION',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Permiso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolPermiso" (
    "id" TEXT NOT NULL,
    "conjuntoId" TEXT NOT NULL,
    "rolId" TEXT NOT NULL,
    "permisoClave" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "RolPermiso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TokenVerificacion" (
    "id" TEXT NOT NULL,
    "tipo" "TipoToken" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "email" TEXT,
    "usuarioId" TEXT,
    "conjuntoId" TEXT,
    "data" JSONB NOT NULL DEFAULT '{}',
    "expira" TIMESTAMP(3) NOT NULL,
    "usadoEn" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "TokenVerificacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invitacion" (
    "id" TEXT NOT NULL,
    "conjuntoId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "telefono" TEXT,
    "nombre" TEXT,
    "unidadId" TEXT,
    "personaId" TEXT,
    "rolClave" TEXT NOT NULL,
    "tipoVinculo" "TipoVinculo",
    "invitadoPorId" TEXT,
    "tokenHash" TEXT NOT NULL,
    "estado" "EstadoInvitacion" NOT NULL DEFAULT 'PENDIENTE',
    "expira" TIMESTAMP(3) NOT NULL,
    "aceptadaEn" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Invitacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SuscripcionPush" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "SuscripcionPush_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TokenApi" (
    "id" TEXT NOT NULL,
    "conjuntoId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "prefijo" TEXT NOT NULL,
    "permisos" TEXT[],
    "ultimoUso" TIMESTAMP(3),
    "revocado" BOOLEAN NOT NULL DEFAULT false,
    "creadoPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "TokenApi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookSaliente" (
    "id" TEXT NOT NULL,
    "conjuntoId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "eventos" TEXT[],
    "secreto" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "WebhookSaliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EntregaWebhook" (
    "id" TEXT NOT NULL,
    "conjuntoId" TEXT NOT NULL,
    "webhookId" TEXT NOT NULL,
    "evento" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "respuesta" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "EntregaWebhook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Persona" (
    "id" TEXT NOT NULL,
    "conjuntoId" TEXT NOT NULL,
    "usuarioId" TEXT,
    "tipoDocumento" "TipoDocumento" NOT NULL DEFAULT 'CC',
    "numeroDocumento" TEXT NOT NULL,
    "nombres" TEXT NOT NULL,
    "apellidos" TEXT NOT NULL,
    "fechaNacimiento" TIMESTAMP(3),
    "genero" TEXT,
    "fotoUrl" TEXT,
    "telefono" TEXT,
    "email" TEXT,
    "eps" TEXT,
    "contactoEmergenciaNombre" TEXT,
    "contactoEmergenciaTelefono" TEXT,
    "ocupacion" TEXT,
    "movilidadReducida" BOOLEAN NOT NULL DEFAULT false,
    "movilidadDescripcion" TEXT,
    "requiereAsistenciaEvacuacion" BOOLEAN NOT NULL DEFAULT false,
    "tipoSangre" TEXT,
    "observaciones" TEXT,
    "directorioOptIn" BOOLEAN NOT NULL DEFAULT false,
    "directorioCampos" TEXT[],
    "serviciosOfrecidos" TEXT,
    "consentimientoDatosEn" TIMESTAMP(3),
    "consentimientoVersion" TEXT,
    "anonimizada" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Persona_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VinculoUnidad" (
    "id" TEXT NOT NULL,
    "conjuntoId" TEXT NOT NULL,
    "personaId" TEXT NOT NULL,
    "unidadId" TEXT NOT NULL,
    "tipo" "TipoVinculo" NOT NULL,
    "porcentajePropiedad" DECIMAL(5,2),
    "fechaInicio" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaFin" TIMESTAMP(3),
    "principal" BOOLEAN NOT NULL DEFAULT false,
    "horarioPermitido" JSONB,
    "estado" "EstadoVinculo" NOT NULL DEFAULT 'ACTIVO',
    "puedeVerCuenta" BOOLEAN NOT NULL DEFAULT false,
    "aprobadoPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "VinculoUnidad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vehiculo" (
    "id" TEXT NOT NULL,
    "conjuntoId" TEXT NOT NULL,
    "unidadId" TEXT NOT NULL,
    "placa" TEXT NOT NULL,
    "tipo" "TipoVehiculo" NOT NULL DEFAULT 'CARRO',
    "marca" TEXT,
    "modelo" TEXT,
    "color" TEXT,
    "fotoUrl" TEXT,
    "tarjetaPropiedadUrl" TEXT,
    "soatVence" TIMESTAMP(3),
    "tecnomecanicaVence" TIMESTAMP(3),
    "parqueaderoId" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Vehiculo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Mascota" (
    "id" TEXT NOT NULL,
    "conjuntoId" TEXT NOT NULL,
    "unidadId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "especie" TEXT NOT NULL,
    "raza" TEXT,
    "color" TEXT,
    "fotoUrl" TEXT,
    "carneVacunasUrl" TEXT,
    "antirrabicaVence" TIMESTAMP(3),
    "potencialmentePeligrosa" BOOLEAN NOT NULL DEFAULT false,
    "polizaUrl" TEXT,
    "microchip" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Mascota_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BorradorFormulario" (
    "id" TEXT NOT NULL,
    "conjuntoId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "clave" TEXT NOT NULL,
    "datos" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "BorradorFormulario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConceptoCobro" (
    "id" TEXT NOT NULL,
    "conjuntoId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" "TipoConcepto" NOT NULL,
    "cuentaContable" TEXT,
    "gravaIva" BOOLEAN NOT NULL DEFAULT false,
    "tarifaIva" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "facturaElectronica" BOOLEAN NOT NULL DEFAULT false,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ConceptoCobro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cuota" (
    "id" TEXT NOT NULL,
    "conjuntoId" TEXT NOT NULL,
    "unidadId" TEXT NOT NULL,
    "conceptoId" TEXT NOT NULL,
    "periodo" TEXT NOT NULL,
    "descripcion" TEXT,
    "fechaEmision" TIMESTAMP(3) NOT NULL,
    "fechaVencimiento" TIMESTAMP(3) NOT NULL,
    "fechaProntoPago" TIMESTAMP(3),
    "porcentajeProntoPago" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "valorBase" DECIMAL(14,2) NOT NULL,
    "iva" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "descuento" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "interes" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "saldo" DECIMAL(14,2) NOT NULL,
    "estado" "EstadoCuota" NOT NULL DEFAULT 'PENDIENTE',
    "referenciaPago" TEXT NOT NULL,
    "origen" "OrigenCuota" NOT NULL DEFAULT 'MANUAL',
    "cuotaExtraordinariaId" TEXT,
    "cuotaOrigenId" TEXT,
    "acuerdoId" TEXT,
    "interesCausadoHasta" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Cuota_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CuotaExtraordinaria" (
    "id" TEXT NOT NULL,
    "conjuntoId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "motivo" TEXT,
    "asambleaId" TEXT,
    "valorTotal" DECIMAL(14,2) NOT NULL,
    "distribucion" "DistribucionCuota" NOT NULL DEFAULT 'POR_COEFICIENTE',
    "numeroCuotas" INTEGER NOT NULL DEFAULT 1,
    "fechaPrimeraCuota" TIMESTAMP(3) NOT NULL,
    "diaVencimiento" INTEGER NOT NULL DEFAULT 10,
    "distribucionManual" JSONB,
    "generada" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "CuotaExtraordinaria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogoInfraccion" (
    "id" TEXT NOT NULL,
    "conjuntoId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "valorSugerido" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "gravedad" "GravedadLlamado" NOT NULL DEFAULT 'LEVE',
    "articulo" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "CatalogoInfraccion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Multa" (
    "id" TEXT NOT NULL,
    "conjuntoId" TEXT NOT NULL,
    "unidadId" TEXT NOT NULL,
    "personaId" TEXT,
    "infraccionId" TEXT,
    "llamadoId" TEXT,
    "descripcion" TEXT NOT NULL,
    "evidencias" TEXT[],
    "valor" DECIMAL(14,2) NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "estado" "EstadoMulta" NOT NULL DEFAULT 'PROPUESTA',
    "notificadaEn" TIMESTAMP(3),
    "plazoDescargos" TIMESTAMP(3),
    "descargos" TEXT,
    "descargosEn" TIMESTAMP(3),
    "resolucion" TEXT,
    "resolucionEn" TIMESTAMP(3),
    "decididaPorId" TEXT,
    "cuotaId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Multa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pago" (
    "id" TEXT NOT NULL,
    "conjuntoId" TEXT NOT NULL,
    "unidadId" TEXT NOT NULL,
    "valor" DECIMAL(14,2) NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "medio" "MedioPago" NOT NULL,
    "pasarela" "Pasarela" NOT NULL DEFAULT 'NINGUNA',
    "referencia" TEXT NOT NULL,
    "referenciaExterna" TEXT,
    "estado" "EstadoPago" NOT NULL DEFAULT 'PENDIENTE',
    "comprobanteUrl" TEXT,
    "registradoPorId" TEXT,
    "conciliado" BOOLEAN NOT NULL DEFAULT false,
    "numeroRecibo" INTEGER,
    "datosPasarela" JSONB,
    "cuotasSeleccionadas" TEXT[],
    "observaciones" TEXT,
    "reservaId" TEXT,
    "pagadorNombre" TEXT,
    "pagadorEmail" TEXT,
    "pagadorDocumento" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Pago_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AplicacionPago" (
    "id" TEXT NOT NULL,
    "conjuntoId" TEXT NOT NULL,
    "pagoId" TEXT NOT NULL,
    "cuotaId" TEXT NOT NULL,
    "valor" DECIMAL(14,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "AplicacionPago_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcuerdoPago" (
    "id" TEXT NOT NULL,
    "conjuntoId" TEXT NOT NULL,
    "unidadId" TEXT NOT NULL,
    "saldoInicial" DECIMAL(14,2) NOT NULL,
    "numeroCuotas" INTEGER NOT NULL,
    "valorCuota" DECIMAL(14,2) NOT NULL,
    "fechaInicio" TIMESTAMP(3) NOT NULL,
    "diaPago" INTEGER NOT NULL DEFAULT 10,
    "estado" "EstadoAcuerdo" NOT NULL DEFAULT 'VIGENTE',
    "documentoUrl" TEXT,
    "observaciones" TEXT,
    "creadoPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "AcuerdoPago_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MovimientoCartera" (
    "id" TEXT NOT NULL,
    "conjuntoId" TEXT NOT NULL,
    "unidadId" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tipo" "TipoMovimiento" NOT NULL,
    "valor" DECIMAL(14,2) NOT NULL,
    "conceptoTipo" "TipoConcepto",
    "cuotaId" TEXT,
    "pagoId" TEXT,
    "descripcion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "MovimientoCartera_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CertificadoPazYSalvo" (
    "id" TEXT NOT NULL,
    "conjuntoId" TEXT NOT NULL,
    "unidadId" TEXT NOT NULL,
    "personaNombre" TEXT,
    "solicitadoPorId" TEXT,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "vigenteHasta" TIMESTAMP(3) NOT NULL,
    "codigo" TEXT NOT NULL,
    "estado" "EstadoCertificado" NOT NULL DEFAULT 'VIGENTE',
    "emitidoPorId" TEXT,
    "automatico" BOOLEAN NOT NULL DEFAULT true,
    "observaciones" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "CertificadoPazYSalvo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CuentaBancaria" (
    "id" TEXT NOT NULL,
    "conjuntoId" TEXT NOT NULL,
    "banco" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'AHORROS',
    "numero" TEXT NOT NULL,
    "titular" TEXT NOT NULL,
    "convenio" TEXT,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "CuentaBancaria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConciliacionBancaria" (
    "id" TEXT NOT NULL,
    "conjuntoId" TEXT NOT NULL,
    "cuentaId" TEXT,
    "archivoNombre" TEXT NOT NULL,
    "periodo" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'EN_PROCESO',
    "totalLineas" INTEGER NOT NULL DEFAULT 0,
    "emparejadas" INTEGER NOT NULL DEFAULT 0,
    "creadoPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ConciliacionBancaria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LineaExtracto" (
    "id" TEXT NOT NULL,
    "conjuntoId" TEXT NOT NULL,
    "conciliacionId" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "descripcion" TEXT,
    "referencia" TEXT,
    "valor" DECIMAL(14,2) NOT NULL,
    "estado" "EstadoLineaExtracto" NOT NULL DEFAULT 'PENDIENTE',
    "pagoId" TEXT,
    "unidadSugeridaId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "LineaExtracto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GestionCobro" (
    "id" TEXT NOT NULL,
    "conjuntoId" TEXT NOT NULL,
    "unidadId" TEXT NOT NULL,
    "canal" "CanalCobro" NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resultado" TEXT,
    "notas" TEXT,
    "usuarioId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "GestionCobro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Consecutivo" (
    "id" TEXT NOT NULL,
    "conjuntoId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "anio" INTEGER NOT NULL DEFAULT 0,
    "valor" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Consecutivo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TasaMora" (
    "id" TEXT NOT NULL,
    "conjuntoId" TEXT NOT NULL,
    "vigenteDesde" TIMESTAMP(3) NOT NULL,
    "tasaEfectivaAnual" DECIMAL(7,4) NOT NULL,
    "tasaMensual" DECIMAL(7,4) NOT NULL,
    "fuente" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "TasaMora_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reserva" (
    "id" TEXT NOT NULL,
    "conjuntoId" TEXT NOT NULL,
    "zonaId" TEXT NOT NULL,
    "unidadId" TEXT NOT NULL,
    "personaId" TEXT,
    "usuarioId" TEXT,
    "inicio" TIMESTAMP(3) NOT NULL,
    "fin" TIMESTAMP(3) NOT NULL,
    "asistentes" INTEGER NOT NULL DEFAULT 1,
    "motivo" TEXT,
    "estado" "EstadoReserva" NOT NULL DEFAULT 'SOLICITADA',
    "valor" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "iva" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "deposito" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "cuotaId" TEXT,
    "pagoId" TEXT,
    "pagada" BOOLEAN NOT NULL DEFAULT false,
    "checkInEn" TIMESTAMP(3),
    "checkInPorId" TEXT,
    "checkOutEn" TIMESTAMP(3),
    "checkOutPorId" TEXT,
    "actaEntrega" JSONB,
    "actaRecepcion" JSONB,
    "actaFotos" TEXT[],
    "calificacion" INTEGER,
    "comentarioCalificacion" TEXT,
    "canceladaEn" TIMESTAMP(3),
    "motivoCancelacion" TEXT,
    "aprobadaPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Reserva_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FacturaElectronica" (
    "id" TEXT NOT NULL,
    "conjuntoId" TEXT NOT NULL,
    "tipo" "TipoDocumentoElectronico" NOT NULL DEFAULT 'FACTURA',
    "proveedor" TEXT NOT NULL DEFAULT 'FACTUS',
    "reservaId" TEXT,
    "pagoId" TEXT,
    "facturaOrigenId" TEXT,
    "referenceCode" TEXT NOT NULL,
    "numero" TEXT,
    "cufe" TEXT,
    "estado" "EstadoFactura" NOT NULL DEFAULT 'PENDIENTE',
    "validadaEn" TIMESTAMP(3),
    "urlPublica" TEXT,
    "qr" TEXT,
    "pdfUrl" TEXT,
    "xmlUrl" TEXT,
    "errores" JSONB,
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "payload" JSONB,
    "respuesta" JSONB,
    "subtotal" DECIMAL(14,2) NOT NULL,
    "iva" DECIMAL(14,2) NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,
    "clienteNombre" TEXT NOT NULL,
    "clienteDocumento" TEXT NOT NULL,
    "clienteEmail" TEXT,
    "descripcion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "FacturaElectronica_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TablaReferencia" (
    "id" TEXT NOT NULL,
    "fuente" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "extra" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "TablaReferencia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Visitante" (
    "id" TEXT NOT NULL,
    "conjuntoId" TEXT NOT NULL,
    "tipoDocumento" "TipoDocumento" NOT NULL DEFAULT 'CC',
    "numeroDocumento" TEXT,
    "nombre" TEXT NOT NULL,
    "fotoUrl" TEXT,
    "telefono" TEXT,
    "empresa" TEXT,
    "tipo" "TipoVisitante" NOT NULL DEFAULT 'VISITA',
    "listaNegra" BOOLEAN NOT NULL DEFAULT false,
    "motivoListaNegra" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Visitante_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutorizacionIngreso" (
    "id" TEXT NOT NULL,
    "conjuntoId" TEXT NOT NULL,
    "unidadId" TEXT NOT NULL,
    "creadaPorId" TEXT,
    "visitanteId" TEXT,
    "nombreVisitante" TEXT NOT NULL,
    "documentoVisitante" TEXT,
    "tipo" "TipoVisitante" NOT NULL DEFAULT 'VISITA',
    "fechaInicio" TIMESTAMP(3) NOT NULL,
    "fechaFin" TIMESTAMP(3) NOT NULL,
    "recurrente" BOOLEAN NOT NULL DEFAULT false,
    "diasSemana" INTEGER[],
    "horaInicio" TEXT,
    "horaFin" TEXT,
    "placa" TEXT,
    "codigo" TEXT NOT NULL,
    "qrToken" TEXT NOT NULL,
    "estado" "EstadoAutorizacion" NOT NULL DEFAULT 'ACTIVA',
    "usosPermitidos" INTEGER NOT NULL DEFAULT 1,
    "usos" INTEGER NOT NULL DEFAULT 0,
    "observaciones" TEXT,
    "soporteSeguridadSocialUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "AutorizacionIngreso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SolicitudIngreso" (
    "id" TEXT NOT NULL,
    "conjuntoId" TEXT NOT NULL,
    "unidadId" TEXT NOT NULL,
    "visitanteNombre" TEXT NOT NULL,
    "visitanteDocumento" TEXT,
    "tipo" "TipoVisitante" NOT NULL DEFAULT 'VISITA',
    "fotoUrl" TEXT,
    "placa" TEXT,
    "estado" "EstadoSolicitudIngreso" NOT NULL DEFAULT 'PENDIENTE',
    "respondidaPorId" TEXT,
    "respondidaEn" TIMESTAMP(3),
    "porteroId" TEXT,
    "registroAccesoId" TEXT,
    "expiraEn" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "SolicitudIngreso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegistroAcceso" (
    "id" TEXT NOT NULL,
    "conjuntoId" TEXT NOT NULL,
    "tipo" "TipoRegistroAcceso" NOT NULL,
    "sujeto" "SujetoAcceso" NOT NULL DEFAULT 'VISITANTE',
    "visitanteId" TEXT,
    "personaId" TEXT,
    "nombre" TEXT NOT NULL,
    "documento" TEXT,
    "unidadId" TEXT,
    "autorizacionId" TEXT,
    "medio" "MedioAcceso" NOT NULL DEFAULT 'MANUAL',
    "placa" TEXT,
    "parqueaderoId" TEXT,
    "hora" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "porteroId" TEXT,
    "fotoUrl" TEXT,
    "observaciones" TEXT,
    "ingresoId" TEXT,
    "anulaId" TEXT,
    "clienteId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "RegistroAcceso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TurnoPorteria" (
    "id" TEXT NOT NULL,
    "conjuntoId" TEXT NOT NULL,
    "porteroId" TEXT NOT NULL,
    "apertura" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cierre" TIMESTAMP(3),
    "novedadesApertura" TEXT,
    "novedadesCierre" TEXT,
    "checklistApertura" JSONB NOT NULL DEFAULT '[]',
    "checklistCierre" JSONB,
    "firmaApertura" TEXT,
    "firmaCierre" TEXT,
    "estado" "EstadoTurno" NOT NULL DEFAULT 'ABIERTO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "TurnoPorteria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Novedad" (
    "id" TEXT NOT NULL,
    "conjuntoId" TEXT NOT NULL,
    "turnoId" TEXT,
    "tipo" "TipoNovedad" NOT NULL,
    "severidad" "Severidad" NOT NULL DEFAULT 'BAJA',
    "descripcion" TEXT NOT NULL,
    "fotos" TEXT[],
    "unidadId" TEXT,
    "reportadoPorId" TEXT,
    "notificada" BOOLEAN NOT NULL DEFAULT false,
    "ticketId" TEXT,
    "clienteId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Novedad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Paquete" (
    "id" TEXT NOT NULL,
    "conjuntoId" TEXT NOT NULL,
    "unidadId" TEXT NOT NULL,
    "destinatario" TEXT,
    "transportadora" TEXT,
    "guia" TEXT,
    "tipo" "TipoPaquete" NOT NULL DEFAULT 'CAJA',
    "fotoUrl" TEXT,
    "fotoGuiaUrl" TEXT,
    "llegadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recibidoPorId" TEXT,
    "estado" "EstadoPaquete" NOT NULL DEFAULT 'EN_PORTERIA',
    "entregadoEn" TIMESTAMP(3),
    "entregadoPorId" TEXT,
    "recogidoPor" TEXT,
    "recogidoPorPersonaId" TEXT,
    "firmaEntrega" TEXT,
    "fotoEntregaUrl" TEXT,
    "notificadoEn" TIMESTAMP(3),
    "observaciones" TEXT,
    "clienteId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Paquete_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LlaveElemento" (
    "id" TEXT NOT NULL,
    "conjuntoId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" "TipoElemento" NOT NULL DEFAULT 'LLAVE',
    "codigo" TEXT,
    "ubicacion" TEXT,
    "estado" "EstadoElemento" NOT NULL DEFAULT 'DISPONIBLE',
    "notas" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "LlaveElemento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrestamoElemento" (
    "id" TEXT NOT NULL,
    "conjuntoId" TEXT NOT NULL,
    "elementoId" TEXT NOT NULL,
    "prestadoA" TEXT NOT NULL,
    "unidadId" TEXT,
    "prestadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "devueltoEn" TIMESTAMP(3),
    "porteroId" TEXT,
    "observaciones" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "PrestamoElemento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlertaEmergencia" (
    "id" TEXT NOT NULL,
    "conjuntoId" TEXT NOT NULL,
    "tipo" "TipoAlerta" NOT NULL,
    "origen" TEXT NOT NULL,
    "unidadId" TEXT,
    "usuarioId" TEXT,
    "mensaje" TEXT,
    "alcance" TEXT NOT NULL DEFAULT 'ADMIN_CONSEJO',
    "estado" "EstadoAlerta" NOT NULL DEFAULT 'ACTIVA',
    "atendidaEn" TIMESTAMP(3),
    "atendidaPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "AlertaEmergencia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Segmento" (
    "id" TEXT NOT NULL,
    "conjuntoId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "definicion" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Segmento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Publicacion" (
    "id" TEXT NOT NULL,
    "conjuntoId" TEXT NOT NULL,
    "autorId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "contenido" JSONB NOT NULL DEFAULT '[]',
    "resumen" TEXT,
    "categoria" "CategoriaPublicacion" NOT NULL DEFAULT 'AVISO',
    "segmentoId" TEXT,
    "audiencia" JSONB,
    "fijada" BOOLEAN NOT NULL DEFAULT false,
    "permiteComentarios" BOOLEAN NOT NULL DEFAULT true,
    "venceEn" TIMESTAMP(3),
    "estado" "EstadoPublicacion" NOT NULL DEFAULT 'PUBLICADA',
    "encuestaId" TEXT,
    "precio" DECIMAL(14,2),
    "imagenes" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Publicacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComentarioPublicacion" (
    "id" TEXT NOT NULL,
    "conjuntoId" TEXT NOT NULL,
    "publicacionId" TEXT NOT NULL,
    "autorId" TEXT NOT NULL,
    "autorNombre" TEXT NOT NULL,
    "contenido" TEXT NOT NULL,
    "oculto" BOOLEAN NOT NULL DEFAULT false,
    "moderadoPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ComentarioPublicacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReaccionPublicacion" (
    "id" TEXT NOT NULL,
    "conjuntoId" TEXT NOT NULL,
    "publicacionId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'LIKE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ReaccionPublicacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LecturaPublicacion" (
    "id" TEXT NOT NULL,
    "conjuntoId" TEXT NOT NULL,
    "publicacionId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "LecturaPublicacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampanaCorreo" (
    "id" TEXT NOT NULL,
    "conjuntoId" TEXT NOT NULL,
    "asunto" TEXT NOT NULL,
    "plantilla" TEXT NOT NULL,
    "tipo" "TipoCampana" NOT NULL DEFAULT 'GENERAL',
    "segmentoId" TEXT,
    "definicionSegmento" JSONB,
    "adjuntos" TEXT[],
    "programadaPara" TIMESTAMP(3),
    "estado" "EstadoCampana" NOT NULL DEFAULT 'BORRADOR',
    "totalDestinatarios" INTEGER NOT NULL DEFAULT 0,
    "enviados" INTEGER NOT NULL DEFAULT 0,
    "rebotes" INTEGER NOT NULL DEFAULT 0,
    "aperturas" INTEGER NOT NULL DEFAULT 0,
    "clics" INTEGER NOT NULL DEFAULT 0,
    "creadaPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "CampanaCorreo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CorreoSaliente" (
    "id" TEXT NOT NULL,
    "conjuntoId" TEXT,
    "campanaId" TEXT,
    "para" TEXT NOT NULL,
    "asunto" TEXT NOT NULL,
    "html" TEXT NOT NULL,
    "texto" TEXT,
    "adjuntos" JSONB,
    "estado" "EstadoCorreo" NOT NULL DEFAULT 'PENDIENTE',
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "enviadoEn" TIMESTAMP(3),
    "abiertoEn" TIMESTAMP(3),
    "clicEn" TIMESTAMP(3),
    "trackingId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "CorreoSaliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notificacion" (
    "id" TEXT NOT NULL,
    "conjuntoId" TEXT,
    "usuarioId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "cuerpo" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'GENERAL',
    "enlace" TEXT,
    "canales" TEXT[],
    "leida" BOOLEAN NOT NULL DEFAULT false,
    "leidaEn" TIMESTAMP(3),
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Notificacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Encuesta" (
    "id" TEXT NOT NULL,
    "conjuntoId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descripcion" TEXT,
    "segmentoId" TEXT,
    "anonima" BOOLEAN NOT NULL DEFAULT false,
    "inicio" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fin" TIMESTAMP(3) NOT NULL,
    "estado" "EstadoEncuesta" NOT NULL DEFAULT 'ABIERTA',
    "creadaPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Encuesta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PreguntaEncuesta" (
    "id" TEXT NOT NULL,
    "conjuntoId" TEXT NOT NULL,
    "encuestaId" TEXT NOT NULL,
    "orden" INTEGER NOT NULL,
    "tipo" "TipoPregunta" NOT NULL,
    "texto" TEXT NOT NULL,
    "opciones" TEXT[],
    "requerida" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "PreguntaEncuesta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RespuestaEncuesta" (
    "id" TEXT NOT NULL,
    "conjuntoId" TEXT NOT NULL,
    "encuestaId" TEXT NOT NULL,
    "usuarioId" TEXT,
    "unidadId" TEXT,
    "respuestas" JSONB NOT NULL,
    "votanteHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "RespuestaEncuesta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CarpetaDocumento" (
    "id" TEXT NOT NULL,
    "conjuntoId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "padreId" TEXT,
    "rolesVisibles" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "CarpetaDocumento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Documento" (
    "id" TEXT NOT NULL,
    "conjuntoId" TEXT NOT NULL,
    "carpetaId" TEXT,
    "titulo" TEXT NOT NULL,
    "descripcion" TEXT,
    "categoria" "CategoriaDocumento" NOT NULL DEFAULT 'OTRO',
    "rolesVisibles" TEXT[],
    "requiereAcuse" BOOLEAN NOT NULL DEFAULT false,
    "versionActual" INTEGER NOT NULL DEFAULT 1,
    "vence" TIMESTAMP(3),
    "publicado" BOOLEAN NOT NULL DEFAULT true,
    "codigoVerificacion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Documento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VersionDocumento" (
    "id" TEXT NOT NULL,
    "conjuntoId" TEXT NOT NULL,
    "documentoId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "archivoUrl" TEXT NOT NULL,
    "nombreArchivo" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "tamano" INTEGER NOT NULL,
    "subidoPorId" TEXT,
    "notas" TEXT,
    "textoExtraido" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "VersionDocumento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcuseDocumento" (
    "id" TEXT NOT NULL,
    "conjuntoId" TEXT NOT NULL,
    "documentoId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "leidoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "AcuseDocumento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventoCalendario" (
    "id" TEXT NOT NULL,
    "conjuntoId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descripcion" TEXT,
    "tipo" "TipoEvento" NOT NULL DEFAULT 'COMUNITARIO',
    "inicio" TIMESTAMP(3) NOT NULL,
    "fin" TIMESTAMP(3) NOT NULL,
    "todoElDia" BOOLEAN NOT NULL DEFAULT false,
    "lugar" TEXT,
    "zonaId" TEXT,
    "creadoPorId" TEXT,
    "visibleResidentes" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "EventoCalendario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ObjetoPerdido" (
    "id" TEXT NOT NULL,
    "conjuntoId" TEXT NOT NULL,
    "tipo" "TipoObjetoPerdido" NOT NULL,
    "descripcion" TEXT NOT NULL,
    "lugar" TEXT,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fotoUrl" TEXT,
    "reportadoPorId" TEXT,
    "contacto" TEXT,
    "estado" "EstadoObjetoPerdido" NOT NULL DEFAULT 'ABIERTO',
    "entregadoA" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ObjetoPerdido_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ticket" (
    "id" TEXT NOT NULL,
    "conjuntoId" TEXT NOT NULL,
    "radicado" TEXT NOT NULL,
    "tipo" "TipoTicket" NOT NULL,
    "unidadId" TEXT,
    "solicitanteId" TEXT,
    "solicitanteNombre" TEXT,
    "solicitanteEmail" TEXT,
    "solicitanteTelefono" TEXT,
    "zonaId" TEXT,
    "activoId" TEXT,
    "titulo" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "adjuntos" TEXT[],
    "ubicacion" TEXT,
    "prioridad" "PrioridadTicket" NOT NULL DEFAULT 'MEDIA',
    "estado" "EstadoTicket" NOT NULL DEFAULT 'ABIERTO',
    "asignadoAId" TEXT,
    "proveedorId" TEXT,
    "fechaLimite" TIMESTAMP(3) NOT NULL,
    "primeraRespuestaEn" TIMESTAMP(3),
    "resueltoEn" TIMESTAMP(3),
    "cerradoEn" TIMESTAMP(3),
    "calificacion" INTEGER,
    "comentarioCalificacion" TEXT,
    "reabiertoVeces" INTEGER NOT NULL DEFAULT 0,
    "origen" "OrigenTicket" NOT NULL DEFAULT 'APP',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComentarioTicket" (
    "id" TEXT NOT NULL,
    "conjuntoId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "autorId" TEXT,
    "contenido" TEXT NOT NULL,
    "interno" BOOLEAN NOT NULL DEFAULT false,
    "adjuntos" TEXT[],
    "tipo" "TipoComentarioTicket" NOT NULL DEFAULT 'COMENTARIO',
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ComentarioTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlantillaRespuesta" (
    "id" TEXT NOT NULL,
    "conjuntoId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "contenido" TEXT NOT NULL,
    "tipoTicket" "TipoTicket",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "PlantillaRespuesta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LlamadoAtencion" (
    "id" TEXT NOT NULL,
    "conjuntoId" TEXT NOT NULL,
    "unidadId" TEXT NOT NULL,
    "personaId" TEXT,
    "infraccionId" TEXT,
    "motivo" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "evidencias" TEXT[],
    "gravedad" "GravedadLlamado" NOT NULL DEFAULT 'LEVE',
    "enviadoPorId" TEXT,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acuseEn" TIMESTAMP(3),
    "respuesta" TEXT,
    "respuestaEn" TIMESTAMP(3),
    "estado" "EstadoLlamado" NOT NULL DEFAULT 'ENVIADO',
    "multaId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "LlamadoAtencion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncidenteConvivencia" (
    "id" TEXT NOT NULL,
    "conjuntoId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "unidadesIds" TEXT[],
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "estado" "EstadoIncidente" NOT NULL DEFAULT 'ABIERTO',
    "mediadorId" TEXT,
    "sesiones" JSONB NOT NULL DEFAULT '[]',
    "acuerdos" TEXT,
    "creadoPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "IncidenteConvivencia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SolicitudObra" (
    "id" TEXT NOT NULL,
    "conjuntoId" TEXT NOT NULL,
    "unidadId" TEXT NOT NULL,
    "solicitanteId" TEXT,
    "descripcion" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'REMODELACION',
    "fechaInicio" TIMESTAMP(3) NOT NULL,
    "fechaFin" TIMESTAMP(3) NOT NULL,
    "horario" TEXT DEFAULT 'L-V 8:00-17:00, S 8:00-13:00',
    "contratistas" JSONB NOT NULL DEFAULT '[]',
    "deposito" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "estado" "EstadoSolicitud" NOT NULL DEFAULT 'SOLICITADA',
    "aprobadaPorId" TEXT,
    "observaciones" TEXT,
    "cierreNotas" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "SolicitudObra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Mudanza" (
    "id" TEXT NOT NULL,
    "conjuntoId" TEXT NOT NULL,
    "unidadId" TEXT NOT NULL,
    "solicitanteId" TEXT,
    "tipo" "TipoMudanza" NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "horaInicio" TEXT NOT NULL,
    "horaFin" TEXT NOT NULL,
    "recurso" TEXT,
    "empresa" TEXT,
    "placaVehiculo" TEXT,
    "enseres" JSONB NOT NULL DEFAULT '[]',
    "pazYSalvoVerificado" BOOLEAN NOT NULL DEFAULT false,
    "estado" "EstadoSolicitud" NOT NULL DEFAULT 'SOLICITADA',
    "aprobadaPorId" TEXT,
    "observaciones" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Mudanza_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asamblea" (
    "id" TEXT NOT NULL,
    "conjuntoId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "tipo" "TipoAsamblea" NOT NULL,
    "modalidad" "ModalidadAsamblea" NOT NULL DEFAULT 'PRESENCIAL',
    "fecha" TIMESTAMP(3) NOT NULL,
    "lugar" TEXT,
    "enlace" TEXT,
    "convocatoriaTexto" TEXT,
    "convocatoriaEnviadaEn" TIMESTAMP(3),
    "ordenDelDia" JSONB NOT NULL DEFAULT '[]',
    "quorumRequerido" DECIMAL(9,6) NOT NULL DEFAULT 50.000001,
    "limitePoderes" INTEGER NOT NULL DEFAULT 2,
    "estado" "EstadoAsamblea" NOT NULL DEFAULT 'BORRADOR',
    "codigoAsistencia" TEXT NOT NULL,
    "actaTexto" TEXT,
    "actaCodigo" TEXT,
    "presidenteNombre" TEXT,
    "secretarioNombre" TEXT,
    "firmaPresidente" TEXT,
    "firmaSecretario" TEXT,
    "actaPublicadaEn" TIMESTAMP(3),
    "compromisos" JSONB NOT NULL DEFAULT '[]',
    "iniciadaEn" TIMESTAMP(3),
    "finalizadaEn" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Asamblea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AsistenciaAsamblea" (
    "id" TEXT NOT NULL,
    "conjuntoId" TEXT NOT NULL,
    "asambleaId" TEXT NOT NULL,
    "unidadId" TEXT NOT NULL,
    "personaNombre" TEXT,
    "usuarioId" TEXT,
    "tipo" "TipoAsistencia" NOT NULL DEFAULT 'PRESENCIAL',
    "coeficiente" DECIMAL(9,6) NOT NULL,
    "poderId" TEXT,
    "registradaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "salidaEn" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "AsistenciaAsamblea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PoderAsamblea" (
    "id" TEXT NOT NULL,
    "conjuntoId" TEXT NOT NULL,
    "asambleaId" TEXT NOT NULL,
    "unidadId" TEXT NOT NULL,
    "otorganteNombre" TEXT NOT NULL,
    "apoderadoNombre" TEXT NOT NULL,
    "apoderadoDocumento" TEXT,
    "apoderadoUsuarioId" TEXT,
    "documentoUrl" TEXT,
    "estado" "EstadoPoder" NOT NULL DEFAULT 'PENDIENTE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "PoderAsamblea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Votacion" (
    "id" TEXT NOT NULL,
    "conjuntoId" TEXT NOT NULL,
    "asambleaId" TEXT,
    "puntoOrden" INTEGER,
    "pregunta" TEXT NOT NULL,
    "descripcion" TEXT,
    "opciones" JSONB NOT NULL,
    "tipoMayoria" "TipoMayoria" NOT NULL DEFAULT 'SIMPLE',
    "ponderacion" "Ponderacion" NOT NULL DEFAULT 'COEFICIENTE',
    "quienVota" "QuienVota" NOT NULL DEFAULT 'PROPIETARIOS',
    "secreto" BOOLEAN NOT NULL DEFAULT false,
    "inicio" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fin" TIMESTAMP(3) NOT NULL,
    "estado" "EstadoVotacion" NOT NULL DEFAULT 'ABIERTA',
    "resultado" JSONB,
    "codigoActa" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Votacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Voto" (
    "id" TEXT NOT NULL,
    "conjuntoId" TEXT NOT NULL,
    "votacionId" TEXT NOT NULL,
    "unidadId" TEXT NOT NULL,
    "opcionId" TEXT NOT NULL,
    "usuarioId" TEXT,
    "votanteNombre" TEXT,
    "coeficiente" DECIMAL(9,6) NOT NULL,
    "porPoder" BOOLEAN NOT NULL DEFAULT false,
    "comprobanteHash" TEXT NOT NULL,
    "emitidoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Voto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MiembroConsejo" (
    "id" TEXT NOT NULL,
    "conjuntoId" TEXT NOT NULL,
    "personaId" TEXT,
    "usuarioId" TEXT,
    "nombre" TEXT NOT NULL,
    "unidadCodigo" TEXT,
    "cargo" "CargoConsejo" NOT NULL DEFAULT 'VOCAL',
    "periodoInicio" TIMESTAMP(3) NOT NULL,
    "periodoFin" TIMESTAMP(3) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "MiembroConsejo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReunionConsejo" (
    "id" TEXT NOT NULL,
    "conjuntoId" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "tema" TEXT NOT NULL,
    "asistentes" TEXT[],
    "actaTexto" TEXT,
    "decisiones" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ReunionConsejo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Activo" (
    "id" TEXT NOT NULL,
    "conjuntoId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "ubicacion" TEXT,
    "zonaId" TEXT,
    "marca" TEXT,
    "modelo" TEXT,
    "serie" TEXT,
    "fechaCompra" TIMESTAMP(3),
    "valor" DECIMAL(14,2),
    "vidaUtilAnios" INTEGER,
    "proveedorId" TEXT,
    "garantiaVence" TIMESTAMP(3),
    "fotos" TEXT[],
    "manuales" TEXT[],
    "codigoQr" TEXT NOT NULL,
    "estado" "EstadoActivo" NOT NULL DEFAULT 'OPERATIVO',
    "notas" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Activo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanMantenimiento" (
    "id" TEXT NOT NULL,
    "conjuntoId" TEXT NOT NULL,
    "activoId" TEXT,
    "zonaId" TEXT,
    "nombre" TEXT NOT NULL,
    "tipo" "TipoMantenimiento" NOT NULL DEFAULT 'PREVENTIVO',
    "frecuenciaDias" INTEGER NOT NULL,
    "proximaFecha" TIMESTAMP(3) NOT NULL,
    "ultimaEjecucion" TIMESTAMP(3),
    "responsableId" TEXT,
    "proveedorId" TEXT,
    "checklist" TEXT[],
    "costoEstimado" DECIMAL(14,2),
    "diasAnticipacion" INTEGER NOT NULL DEFAULT 7,
    "activoPlan" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "PlanMantenimiento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrdenTrabajo" (
    "id" TEXT NOT NULL,
    "conjuntoId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "origen" "OrigenOrden" NOT NULL DEFAULT 'MANUAL',
    "planId" TEXT,
    "ticketId" TEXT,
    "activoId" TEXT,
    "zonaId" TEXT,
    "proveedorId" TEXT,
    "asignadoAId" TEXT,
    "titulo" TEXT NOT NULL,
    "descripcion" TEXT,
    "fechaProgramada" TIMESTAMP(3) NOT NULL,
    "fechaInicio" TIMESTAMP(3),
    "fechaCierre" TIMESTAMP(3),
    "costo" DECIMAL(14,2),
    "checklist" JSONB NOT NULL DEFAULT '[]',
    "evidencias" TEXT[],
    "estado" "EstadoOrden" NOT NULL DEFAULT 'PENDIENTE',
    "notasCierre" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "OrdenTrabajo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Proveedor" (
    "id" TEXT NOT NULL,
    "conjuntoId" TEXT NOT NULL,
    "nit" TEXT NOT NULL,
    "razonSocial" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "contactoNombre" TEXT,
    "telefono" TEXT,
    "email" TEXT,
    "direccion" TEXT,
    "tarifas" TEXT,
    "directorioComunitario" BOOLEAN NOT NULL DEFAULT false,
    "beneficioComunidad" TEXT,
    "calificacionPromedio" DECIMAL(3,2) NOT NULL DEFAULT 0,
    "usuarioId" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Proveedor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentoProveedor" (
    "id" TEXT NOT NULL,
    "conjuntoId" TEXT NOT NULL,
    "proveedorId" TEXT NOT NULL,
    "tipo" "TipoDocProveedor" NOT NULL,
    "archivoUrl" TEXT,
    "vence" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "DocumentoProveedor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalificacionProveedor" (
    "id" TEXT NOT NULL,
    "conjuntoId" TEXT NOT NULL,
    "proveedorId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "usuarioNombre" TEXT,
    "puntaje" INTEGER NOT NULL,
    "comentario" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "CalificacionProveedor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contrato" (
    "id" TEXT NOT NULL,
    "conjuntoId" TEXT NOT NULL,
    "proveedorId" TEXT NOT NULL,
    "objeto" TEXT NOT NULL,
    "valor" DECIMAL(14,2) NOT NULL,
    "inicio" TIMESTAMP(3) NOT NULL,
    "fin" TIMESTAMP(3) NOT NULL,
    "renovacionAutomatica" BOOLEAN NOT NULL DEFAULT false,
    "diasAlerta" INTEGER NOT NULL DEFAULT 30,
    "documentoUrl" TEXT,
    "estado" "EstadoContrato" NOT NULL DEFAULT 'VIGENTE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Contrato_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Presupuesto" (
    "id" TEXT NOT NULL,
    "conjuntoId" TEXT NOT NULL,
    "anio" INTEGER NOT NULL,
    "estado" "EstadoPresupuesto" NOT NULL DEFAULT 'BORRADOR',
    "asambleaId" TEXT,
    "notas" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Presupuesto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RubroPresupuesto" (
    "id" TEXT NOT NULL,
    "conjuntoId" TEXT NOT NULL,
    "presupuestoId" TEXT NOT NULL,
    "tipo" "TipoRubro" NOT NULL,
    "nombre" TEXT NOT NULL,
    "cuentaContable" TEXT,
    "valorAnual" DECIMAL(14,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "RubroPresupuesto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Gasto" (
    "id" TEXT NOT NULL,
    "conjuntoId" TEXT NOT NULL,
    "rubroId" TEXT,
    "proveedorId" TEXT,
    "ordenTrabajoId" TEXT,
    "fecha" TIMESTAMP(3) NOT NULL,
    "descripcion" TEXT NOT NULL,
    "valor" DECIMAL(14,2) NOT NULL,
    "comprobanteUrl" TEXT,
    "estado" "EstadoGasto" NOT NULL DEFAULT 'PENDIENTE_APROBACION',
    "aprobadoPorId" TEXT,
    "cuentaContable" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Gasto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Empleado" (
    "id" TEXT NOT NULL,
    "conjuntoId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "documento" TEXT,
    "cargo" TEXT NOT NULL,
    "turno" TEXT,
    "telefono" TEXT,
    "fotoUrl" TEXT,
    "epsVence" TIMESTAMP(3),
    "arlVence" TIMESTAMP(3),
    "fechaIngreso" TIMESTAMP(3),
    "documentos" TEXT[],
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Empleado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanEmergencia" (
    "id" TEXT NOT NULL,
    "conjuntoId" TEXT NOT NULL,
    "puntosEncuentro" JSONB NOT NULL DEFAULT '[]',
    "instrucciones" TEXT,
    "telefonosEmergencia" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "PlanEmergencia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Brigadista" (
    "id" TEXT NOT NULL,
    "conjuntoId" TEXT NOT NULL,
    "personaId" TEXT,
    "nombre" TEXT NOT NULL,
    "rol" "RolBrigadista" NOT NULL,
    "torreNombre" TEXT,
    "telefono" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Brigadista_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Simulacro" (
    "id" TEXT NOT NULL,
    "conjuntoId" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "tipo" TEXT NOT NULL,
    "participantes" INTEGER NOT NULL DEFAULT 0,
    "tiempoEvacuacionMin" INTEGER,
    "observaciones" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Simulacro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Auditoria" (
    "id" TEXT NOT NULL,
    "conjuntoId" TEXT,
    "usuarioId" TEXT,
    "usuarioNombre" TEXT,
    "impersonadoPorId" TEXT,
    "accion" TEXT NOT NULL,
    "entidad" TEXT NOT NULL,
    "entidadId" TEXT,
    "antes" JSONB,
    "despues" JSONB,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Adjunto" (
    "id" TEXT NOT NULL,
    "conjuntoId" TEXT NOT NULL,
    "entidad" TEXT NOT NULL,
    "entidadId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "tamano" INTEGER NOT NULL,
    "subidoPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Adjunto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportacionApertura" (
    "id" TEXT NOT NULL,
    "conjuntoId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "archivoNombre" TEXT NOT NULL,
    "estado" "EstadoImportacion" NOT NULL DEFAULT 'VALIDANDO',
    "totalFilas" INTEGER NOT NULL DEFAULT 0,
    "filasOk" INTEGER NOT NULL DEFAULT 0,
    "filasError" INTEGER NOT NULL DEFAULT 0,
    "errores" JSONB NOT NULL DEFAULT '[]',
    "resumen" JSONB,
    "creadoPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ImportacionApertura_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConfiguracionIntegracion" (
    "id" TEXT NOT NULL,
    "conjuntoId" TEXT,
    "tipo" "TipoIntegracion" NOT NULL,
    "datosCifrados" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "ultimaPrueba" TIMESTAMP(3),
    "ultimoResultado" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ConfiguracionIntegracion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Backup" (
    "id" TEXT NOT NULL,
    "conjuntoId" TEXT NOT NULL,
    "archivoUrl" TEXT NOT NULL,
    "tamano" INTEGER NOT NULL,
    "registros" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Backup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsultaIA" (
    "id" TEXT NOT NULL,
    "conjuntoId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "pregunta" TEXT NOT NULL,
    "respuesta" TEXT NOT NULL,
    "tokens" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ConsultaIA_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Suscripcion_conjuntoId_idx" ON "Suscripcion"("conjuntoId");

-- CreateIndex
CREATE UNIQUE INDEX "Conjunto_slug_key" ON "Conjunto"("slug");

-- CreateIndex
CREATE INDEX "Torre_conjuntoId_idx" ON "Torre"("conjuntoId");

-- CreateIndex
CREATE UNIQUE INDEX "Torre_conjuntoId_nombre_key" ON "Torre"("conjuntoId", "nombre");

-- CreateIndex
CREATE INDEX "Unidad_conjuntoId_idx" ON "Unidad"("conjuntoId");

-- CreateIndex
CREATE INDEX "Unidad_torreId_idx" ON "Unidad"("torreId");

-- CreateIndex
CREATE UNIQUE INDEX "Unidad_conjuntoId_codigo_key" ON "Unidad"("conjuntoId", "codigo");

-- CreateIndex
CREATE INDEX "HistorialCoeficiente_conjuntoId_idx" ON "HistorialCoeficiente"("conjuntoId");

-- CreateIndex
CREATE INDEX "Parqueadero_conjuntoId_idx" ON "Parqueadero"("conjuntoId");

-- CreateIndex
CREATE UNIQUE INDEX "Parqueadero_conjuntoId_codigo_key" ON "Parqueadero"("conjuntoId", "codigo");

-- CreateIndex
CREATE INDEX "Bodega_conjuntoId_idx" ON "Bodega"("conjuntoId");

-- CreateIndex
CREATE UNIQUE INDEX "Bodega_conjuntoId_codigo_key" ON "Bodega"("conjuntoId", "codigo");

-- CreateIndex
CREATE INDEX "ZonaComun_conjuntoId_idx" ON "ZonaComun"("conjuntoId");

-- CreateIndex
CREATE INDEX "BloqueoZona_conjuntoId_zonaId_idx" ON "BloqueoZona"("conjuntoId", "zonaId");

-- CreateIndex
CREATE INDEX "ReglaReserva_conjuntoId_zonaId_idx" ON "ReglaReserva"("conjuntoId", "zonaId");

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_email_key" ON "Usuario"("email");

-- CreateIndex
CREATE INDEX "MembresiaConjunto_conjuntoId_idx" ON "MembresiaConjunto"("conjuntoId");

-- CreateIndex
CREATE UNIQUE INDEX "MembresiaConjunto_usuarioId_conjuntoId_key" ON "MembresiaConjunto"("usuarioId", "conjuntoId");

-- CreateIndex
CREATE INDEX "Rol_conjuntoId_idx" ON "Rol"("conjuntoId");

-- CreateIndex
CREATE UNIQUE INDEX "Rol_conjuntoId_clave_key" ON "Rol"("conjuntoId", "clave");

-- CreateIndex
CREATE UNIQUE INDEX "Permiso_clave_key" ON "Permiso"("clave");

-- CreateIndex
CREATE INDEX "RolPermiso_conjuntoId_idx" ON "RolPermiso"("conjuntoId");

-- CreateIndex
CREATE UNIQUE INDEX "RolPermiso_rolId_permisoClave_key" ON "RolPermiso"("rolId", "permisoClave");

-- CreateIndex
CREATE UNIQUE INDEX "TokenVerificacion_tokenHash_key" ON "TokenVerificacion"("tokenHash");

-- CreateIndex
CREATE INDEX "TokenVerificacion_email_idx" ON "TokenVerificacion"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Invitacion_tokenHash_key" ON "Invitacion"("tokenHash");

-- CreateIndex
CREATE INDEX "Invitacion_conjuntoId_idx" ON "Invitacion"("conjuntoId");

-- CreateIndex
CREATE UNIQUE INDEX "SuscripcionPush_endpoint_key" ON "SuscripcionPush"("endpoint");

-- CreateIndex
CREATE UNIQUE INDEX "TokenApi_tokenHash_key" ON "TokenApi"("tokenHash");

-- CreateIndex
CREATE INDEX "TokenApi_conjuntoId_idx" ON "TokenApi"("conjuntoId");

-- CreateIndex
CREATE INDEX "WebhookSaliente_conjuntoId_idx" ON "WebhookSaliente"("conjuntoId");

-- CreateIndex
CREATE INDEX "EntregaWebhook_conjuntoId_idx" ON "EntregaWebhook"("conjuntoId");

-- CreateIndex
CREATE INDEX "Persona_conjuntoId_idx" ON "Persona"("conjuntoId");

-- CreateIndex
CREATE UNIQUE INDEX "Persona_conjuntoId_tipoDocumento_numeroDocumento_key" ON "Persona"("conjuntoId", "tipoDocumento", "numeroDocumento");

-- CreateIndex
CREATE INDEX "VinculoUnidad_conjuntoId_idx" ON "VinculoUnidad"("conjuntoId");

-- CreateIndex
CREATE INDEX "VinculoUnidad_unidadId_idx" ON "VinculoUnidad"("unidadId");

-- CreateIndex
CREATE INDEX "VinculoUnidad_personaId_idx" ON "VinculoUnidad"("personaId");

-- CreateIndex
CREATE INDEX "Vehiculo_conjuntoId_idx" ON "Vehiculo"("conjuntoId");

-- CreateIndex
CREATE UNIQUE INDEX "Vehiculo_conjuntoId_placa_key" ON "Vehiculo"("conjuntoId", "placa");

-- CreateIndex
CREATE INDEX "Mascota_conjuntoId_idx" ON "Mascota"("conjuntoId");

-- CreateIndex
CREATE INDEX "BorradorFormulario_conjuntoId_idx" ON "BorradorFormulario"("conjuntoId");

-- CreateIndex
CREATE UNIQUE INDEX "BorradorFormulario_usuarioId_conjuntoId_clave_key" ON "BorradorFormulario"("usuarioId", "conjuntoId", "clave");

-- CreateIndex
CREATE INDEX "ConceptoCobro_conjuntoId_idx" ON "ConceptoCobro"("conjuntoId");

-- CreateIndex
CREATE UNIQUE INDEX "Cuota_referenciaPago_key" ON "Cuota"("referenciaPago");

-- CreateIndex
CREATE INDEX "Cuota_conjuntoId_idx" ON "Cuota"("conjuntoId");

-- CreateIndex
CREATE INDEX "Cuota_unidadId_estado_idx" ON "Cuota"("unidadId", "estado");

-- CreateIndex
CREATE INDEX "Cuota_conjuntoId_periodo_idx" ON "Cuota"("conjuntoId", "periodo");

-- CreateIndex
CREATE INDEX "CuotaExtraordinaria_conjuntoId_idx" ON "CuotaExtraordinaria"("conjuntoId");

-- CreateIndex
CREATE INDEX "CatalogoInfraccion_conjuntoId_idx" ON "CatalogoInfraccion"("conjuntoId");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogoInfraccion_conjuntoId_codigo_key" ON "CatalogoInfraccion"("conjuntoId", "codigo");

-- CreateIndex
CREATE INDEX "Multa_conjuntoId_idx" ON "Multa"("conjuntoId");

-- CreateIndex
CREATE UNIQUE INDEX "Pago_referencia_key" ON "Pago"("referencia");

-- CreateIndex
CREATE INDEX "Pago_conjuntoId_idx" ON "Pago"("conjuntoId");

-- CreateIndex
CREATE INDEX "Pago_unidadId_idx" ON "Pago"("unidadId");

-- CreateIndex
CREATE INDEX "AplicacionPago_conjuntoId_idx" ON "AplicacionPago"("conjuntoId");

-- CreateIndex
CREATE INDEX "AcuerdoPago_conjuntoId_idx" ON "AcuerdoPago"("conjuntoId");

-- CreateIndex
CREATE INDEX "MovimientoCartera_conjuntoId_idx" ON "MovimientoCartera"("conjuntoId");

-- CreateIndex
CREATE INDEX "MovimientoCartera_unidadId_fecha_idx" ON "MovimientoCartera"("unidadId", "fecha");

-- CreateIndex
CREATE UNIQUE INDEX "CertificadoPazYSalvo_codigo_key" ON "CertificadoPazYSalvo"("codigo");

-- CreateIndex
CREATE INDEX "CertificadoPazYSalvo_conjuntoId_idx" ON "CertificadoPazYSalvo"("conjuntoId");

-- CreateIndex
CREATE INDEX "CuentaBancaria_conjuntoId_idx" ON "CuentaBancaria"("conjuntoId");

-- CreateIndex
CREATE INDEX "ConciliacionBancaria_conjuntoId_idx" ON "ConciliacionBancaria"("conjuntoId");

-- CreateIndex
CREATE INDEX "LineaExtracto_conjuntoId_idx" ON "LineaExtracto"("conjuntoId");

-- CreateIndex
CREATE INDEX "GestionCobro_conjuntoId_idx" ON "GestionCobro"("conjuntoId");

-- CreateIndex
CREATE INDEX "GestionCobro_unidadId_canal_fecha_idx" ON "GestionCobro"("unidadId", "canal", "fecha");

-- CreateIndex
CREATE UNIQUE INDEX "Consecutivo_conjuntoId_tipo_anio_key" ON "Consecutivo"("conjuntoId", "tipo", "anio");

-- CreateIndex
CREATE INDEX "TasaMora_conjuntoId_vigenteDesde_idx" ON "TasaMora"("conjuntoId", "vigenteDesde");

-- CreateIndex
CREATE INDEX "Reserva_conjuntoId_idx" ON "Reserva"("conjuntoId");

-- CreateIndex
CREATE INDEX "Reserva_zonaId_inicio_idx" ON "Reserva"("zonaId", "inicio");

-- CreateIndex
CREATE UNIQUE INDEX "FacturaElectronica_referenceCode_key" ON "FacturaElectronica"("referenceCode");

-- CreateIndex
CREATE INDEX "FacturaElectronica_conjuntoId_idx" ON "FacturaElectronica"("conjuntoId");

-- CreateIndex
CREATE UNIQUE INDEX "TablaReferencia_fuente_tipo_codigo_key" ON "TablaReferencia"("fuente", "tipo", "codigo");

-- CreateIndex
CREATE INDEX "Visitante_conjuntoId_idx" ON "Visitante"("conjuntoId");

-- CreateIndex
CREATE INDEX "Visitante_conjuntoId_numeroDocumento_idx" ON "Visitante"("conjuntoId", "numeroDocumento");

-- CreateIndex
CREATE UNIQUE INDEX "AutorizacionIngreso_qrToken_key" ON "AutorizacionIngreso"("qrToken");

-- CreateIndex
CREATE INDEX "AutorizacionIngreso_conjuntoId_idx" ON "AutorizacionIngreso"("conjuntoId");

-- CreateIndex
CREATE INDEX "AutorizacionIngreso_conjuntoId_codigo_idx" ON "AutorizacionIngreso"("conjuntoId", "codigo");

-- CreateIndex
CREATE INDEX "SolicitudIngreso_conjuntoId_idx" ON "SolicitudIngreso"("conjuntoId");

-- CreateIndex
CREATE UNIQUE INDEX "RegistroAcceso_clienteId_key" ON "RegistroAcceso"("clienteId");

-- CreateIndex
CREATE INDEX "RegistroAcceso_conjuntoId_hora_idx" ON "RegistroAcceso"("conjuntoId", "hora");

-- CreateIndex
CREATE INDEX "RegistroAcceso_ingresoId_idx" ON "RegistroAcceso"("ingresoId");

-- CreateIndex
CREATE INDEX "TurnoPorteria_conjuntoId_idx" ON "TurnoPorteria"("conjuntoId");

-- CreateIndex
CREATE UNIQUE INDEX "Novedad_clienteId_key" ON "Novedad"("clienteId");

-- CreateIndex
CREATE INDEX "Novedad_conjuntoId_createdAt_idx" ON "Novedad"("conjuntoId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Paquete_clienteId_key" ON "Paquete"("clienteId");

-- CreateIndex
CREATE INDEX "Paquete_conjuntoId_estado_idx" ON "Paquete"("conjuntoId", "estado");

-- CreateIndex
CREATE INDEX "LlaveElemento_conjuntoId_idx" ON "LlaveElemento"("conjuntoId");

-- CreateIndex
CREATE INDEX "PrestamoElemento_conjuntoId_idx" ON "PrestamoElemento"("conjuntoId");

-- CreateIndex
CREATE INDEX "AlertaEmergencia_conjuntoId_idx" ON "AlertaEmergencia"("conjuntoId");

-- CreateIndex
CREATE INDEX "Segmento_conjuntoId_idx" ON "Segmento"("conjuntoId");

-- CreateIndex
CREATE INDEX "Publicacion_conjuntoId_createdAt_idx" ON "Publicacion"("conjuntoId", "createdAt");

-- CreateIndex
CREATE INDEX "ComentarioPublicacion_conjuntoId_idx" ON "ComentarioPublicacion"("conjuntoId");

-- CreateIndex
CREATE INDEX "ReaccionPublicacion_conjuntoId_idx" ON "ReaccionPublicacion"("conjuntoId");

-- CreateIndex
CREATE UNIQUE INDEX "ReaccionPublicacion_publicacionId_usuarioId_key" ON "ReaccionPublicacion"("publicacionId", "usuarioId");

-- CreateIndex
CREATE INDEX "LecturaPublicacion_conjuntoId_idx" ON "LecturaPublicacion"("conjuntoId");

-- CreateIndex
CREATE UNIQUE INDEX "LecturaPublicacion_publicacionId_usuarioId_key" ON "LecturaPublicacion"("publicacionId", "usuarioId");

-- CreateIndex
CREATE INDEX "CampanaCorreo_conjuntoId_idx" ON "CampanaCorreo"("conjuntoId");

-- CreateIndex
CREATE UNIQUE INDEX "CorreoSaliente_trackingId_key" ON "CorreoSaliente"("trackingId");

-- CreateIndex
CREATE INDEX "CorreoSaliente_estado_createdAt_idx" ON "CorreoSaliente"("estado", "createdAt");

-- CreateIndex
CREATE INDEX "Notificacion_usuarioId_leida_idx" ON "Notificacion"("usuarioId", "leida");

-- CreateIndex
CREATE INDEX "Encuesta_conjuntoId_idx" ON "Encuesta"("conjuntoId");

-- CreateIndex
CREATE INDEX "RespuestaEncuesta_conjuntoId_idx" ON "RespuestaEncuesta"("conjuntoId");

-- CreateIndex
CREATE UNIQUE INDEX "RespuestaEncuesta_encuestaId_votanteHash_key" ON "RespuestaEncuesta"("encuestaId", "votanteHash");

-- CreateIndex
CREATE INDEX "CarpetaDocumento_conjuntoId_idx" ON "CarpetaDocumento"("conjuntoId");

-- CreateIndex
CREATE UNIQUE INDEX "Documento_codigoVerificacion_key" ON "Documento"("codigoVerificacion");

-- CreateIndex
CREATE INDEX "Documento_conjuntoId_idx" ON "Documento"("conjuntoId");

-- CreateIndex
CREATE INDEX "VersionDocumento_conjuntoId_idx" ON "VersionDocumento"("conjuntoId");

-- CreateIndex
CREATE INDEX "AcuseDocumento_conjuntoId_idx" ON "AcuseDocumento"("conjuntoId");

-- CreateIndex
CREATE UNIQUE INDEX "AcuseDocumento_documentoId_usuarioId_version_key" ON "AcuseDocumento"("documentoId", "usuarioId", "version");

-- CreateIndex
CREATE INDEX "EventoCalendario_conjuntoId_inicio_idx" ON "EventoCalendario"("conjuntoId", "inicio");

-- CreateIndex
CREATE INDEX "ObjetoPerdido_conjuntoId_idx" ON "ObjetoPerdido"("conjuntoId");

-- CreateIndex
CREATE INDEX "Ticket_conjuntoId_estado_idx" ON "Ticket"("conjuntoId", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_conjuntoId_radicado_key" ON "Ticket"("conjuntoId", "radicado");

-- CreateIndex
CREATE INDEX "ComentarioTicket_conjuntoId_idx" ON "ComentarioTicket"("conjuntoId");

-- CreateIndex
CREATE INDEX "PlantillaRespuesta_conjuntoId_idx" ON "PlantillaRespuesta"("conjuntoId");

-- CreateIndex
CREATE INDEX "LlamadoAtencion_conjuntoId_idx" ON "LlamadoAtencion"("conjuntoId");

-- CreateIndex
CREATE INDEX "IncidenteConvivencia_conjuntoId_idx" ON "IncidenteConvivencia"("conjuntoId");

-- CreateIndex
CREATE INDEX "SolicitudObra_conjuntoId_idx" ON "SolicitudObra"("conjuntoId");

-- CreateIndex
CREATE INDEX "Mudanza_conjuntoId_idx" ON "Mudanza"("conjuntoId");

-- CreateIndex
CREATE UNIQUE INDEX "Asamblea_codigoAsistencia_key" ON "Asamblea"("codigoAsistencia");

-- CreateIndex
CREATE UNIQUE INDEX "Asamblea_actaCodigo_key" ON "Asamblea"("actaCodigo");

-- CreateIndex
CREATE INDEX "Asamblea_conjuntoId_idx" ON "Asamblea"("conjuntoId");

-- CreateIndex
CREATE INDEX "AsistenciaAsamblea_conjuntoId_idx" ON "AsistenciaAsamblea"("conjuntoId");

-- CreateIndex
CREATE UNIQUE INDEX "AsistenciaAsamblea_asambleaId_unidadId_key" ON "AsistenciaAsamblea"("asambleaId", "unidadId");

-- CreateIndex
CREATE INDEX "PoderAsamblea_conjuntoId_idx" ON "PoderAsamblea"("conjuntoId");

-- CreateIndex
CREATE UNIQUE INDEX "PoderAsamblea_asambleaId_unidadId_key" ON "PoderAsamblea"("asambleaId", "unidadId");

-- CreateIndex
CREATE UNIQUE INDEX "Votacion_codigoActa_key" ON "Votacion"("codigoActa");

-- CreateIndex
CREATE INDEX "Votacion_conjuntoId_idx" ON "Votacion"("conjuntoId");

-- CreateIndex
CREATE UNIQUE INDEX "Voto_comprobanteHash_key" ON "Voto"("comprobanteHash");

-- CreateIndex
CREATE INDEX "Voto_conjuntoId_idx" ON "Voto"("conjuntoId");

-- CreateIndex
CREATE UNIQUE INDEX "Voto_votacionId_unidadId_key" ON "Voto"("votacionId", "unidadId");

-- CreateIndex
CREATE INDEX "MiembroConsejo_conjuntoId_idx" ON "MiembroConsejo"("conjuntoId");

-- CreateIndex
CREATE INDEX "ReunionConsejo_conjuntoId_idx" ON "ReunionConsejo"("conjuntoId");

-- CreateIndex
CREATE UNIQUE INDEX "Activo_codigoQr_key" ON "Activo"("codigoQr");

-- CreateIndex
CREATE INDEX "Activo_conjuntoId_idx" ON "Activo"("conjuntoId");

-- CreateIndex
CREATE INDEX "PlanMantenimiento_conjuntoId_idx" ON "PlanMantenimiento"("conjuntoId");

-- CreateIndex
CREATE INDEX "OrdenTrabajo_conjuntoId_idx" ON "OrdenTrabajo"("conjuntoId");

-- CreateIndex
CREATE UNIQUE INDEX "OrdenTrabajo_conjuntoId_numero_key" ON "OrdenTrabajo"("conjuntoId", "numero");

-- CreateIndex
CREATE INDEX "Proveedor_conjuntoId_idx" ON "Proveedor"("conjuntoId");

-- CreateIndex
CREATE INDEX "DocumentoProveedor_conjuntoId_idx" ON "DocumentoProveedor"("conjuntoId");

-- CreateIndex
CREATE INDEX "CalificacionProveedor_conjuntoId_idx" ON "CalificacionProveedor"("conjuntoId");

-- CreateIndex
CREATE UNIQUE INDEX "CalificacionProveedor_proveedorId_usuarioId_key" ON "CalificacionProveedor"("proveedorId", "usuarioId");

-- CreateIndex
CREATE INDEX "Contrato_conjuntoId_idx" ON "Contrato"("conjuntoId");

-- CreateIndex
CREATE UNIQUE INDEX "Presupuesto_conjuntoId_anio_key" ON "Presupuesto"("conjuntoId", "anio");

-- CreateIndex
CREATE INDEX "RubroPresupuesto_conjuntoId_idx" ON "RubroPresupuesto"("conjuntoId");

-- CreateIndex
CREATE INDEX "Gasto_conjuntoId_idx" ON "Gasto"("conjuntoId");

-- CreateIndex
CREATE INDEX "Empleado_conjuntoId_idx" ON "Empleado"("conjuntoId");

-- CreateIndex
CREATE UNIQUE INDEX "PlanEmergencia_conjuntoId_key" ON "PlanEmergencia"("conjuntoId");

-- CreateIndex
CREATE INDEX "Brigadista_conjuntoId_idx" ON "Brigadista"("conjuntoId");

-- CreateIndex
CREATE INDEX "Simulacro_conjuntoId_idx" ON "Simulacro"("conjuntoId");

-- CreateIndex
CREATE INDEX "Auditoria_conjuntoId_createdAt_idx" ON "Auditoria"("conjuntoId", "createdAt");

-- CreateIndex
CREATE INDEX "Auditoria_entidad_entidadId_idx" ON "Auditoria"("entidad", "entidadId");

-- CreateIndex
CREATE INDEX "Adjunto_conjuntoId_entidad_entidadId_idx" ON "Adjunto"("conjuntoId", "entidad", "entidadId");

-- CreateIndex
CREATE INDEX "ImportacionApertura_conjuntoId_idx" ON "ImportacionApertura"("conjuntoId");

-- CreateIndex
CREATE UNIQUE INDEX "ConfiguracionIntegracion_conjuntoId_tipo_key" ON "ConfiguracionIntegracion"("conjuntoId", "tipo");

-- CreateIndex
CREATE INDEX "Backup_conjuntoId_idx" ON "Backup"("conjuntoId");

-- CreateIndex
CREATE INDEX "ConsultaIA_conjuntoId_idx" ON "ConsultaIA"("conjuntoId");

-- AddForeignKey
ALTER TABLE "Suscripcion" ADD CONSTRAINT "Suscripcion_conjuntoId_fkey" FOREIGN KEY ("conjuntoId") REFERENCES "Conjunto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Suscripcion" ADD CONSTRAINT "Suscripcion_planId_fkey" FOREIGN KEY ("planId") REFERENCES "PlanSuscripcion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CobroSuscripcion" ADD CONSTRAINT "CobroSuscripcion_suscripcionId_fkey" FOREIGN KEY ("suscripcionId") REFERENCES "Suscripcion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conjunto" ADD CONSTRAINT "Conjunto_planId_fkey" FOREIGN KEY ("planId") REFERENCES "PlanSuscripcion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Torre" ADD CONSTRAINT "Torre_conjuntoId_fkey" FOREIGN KEY ("conjuntoId") REFERENCES "Conjunto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Unidad" ADD CONSTRAINT "Unidad_conjuntoId_fkey" FOREIGN KEY ("conjuntoId") REFERENCES "Conjunto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Unidad" ADD CONSTRAINT "Unidad_torreId_fkey" FOREIGN KEY ("torreId") REFERENCES "Torre"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistorialCoeficiente" ADD CONSTRAINT "HistorialCoeficiente_unidadId_fkey" FOREIGN KEY ("unidadId") REFERENCES "Unidad"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Parqueadero" ADD CONSTRAINT "Parqueadero_conjuntoId_fkey" FOREIGN KEY ("conjuntoId") REFERENCES "Conjunto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Parqueadero" ADD CONSTRAINT "Parqueadero_unidadId_fkey" FOREIGN KEY ("unidadId") REFERENCES "Unidad"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bodega" ADD CONSTRAINT "Bodega_conjuntoId_fkey" FOREIGN KEY ("conjuntoId") REFERENCES "Conjunto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bodega" ADD CONSTRAINT "Bodega_unidadId_fkey" FOREIGN KEY ("unidadId") REFERENCES "Unidad"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ZonaComun" ADD CONSTRAINT "ZonaComun_conjuntoId_fkey" FOREIGN KEY ("conjuntoId") REFERENCES "Conjunto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BloqueoZona" ADD CONSTRAINT "BloqueoZona_zonaId_fkey" FOREIGN KEY ("zonaId") REFERENCES "ZonaComun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReglaReserva" ADD CONSTRAINT "ReglaReserva_zonaId_fkey" FOREIGN KEY ("zonaId") REFERENCES "ZonaComun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembresiaConjunto" ADD CONSTRAINT "MembresiaConjunto_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembresiaConjunto" ADD CONSTRAINT "MembresiaConjunto_conjuntoId_fkey" FOREIGN KEY ("conjuntoId") REFERENCES "Conjunto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembresiaConjunto" ADD CONSTRAINT "MembresiaConjunto_rolId_fkey" FOREIGN KEY ("rolId") REFERENCES "Rol"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rol" ADD CONSTRAINT "Rol_conjuntoId_fkey" FOREIGN KEY ("conjuntoId") REFERENCES "Conjunto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolPermiso" ADD CONSTRAINT "RolPermiso_rolId_fkey" FOREIGN KEY ("rolId") REFERENCES "Rol"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SuscripcionPush" ADD CONSTRAINT "SuscripcionPush_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntregaWebhook" ADD CONSTRAINT "EntregaWebhook_webhookId_fkey" FOREIGN KEY ("webhookId") REFERENCES "WebhookSaliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Persona" ADD CONSTRAINT "Persona_conjuntoId_fkey" FOREIGN KEY ("conjuntoId") REFERENCES "Conjunto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Persona" ADD CONSTRAINT "Persona_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VinculoUnidad" ADD CONSTRAINT "VinculoUnidad_conjuntoId_fkey" FOREIGN KEY ("conjuntoId") REFERENCES "Conjunto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VinculoUnidad" ADD CONSTRAINT "VinculoUnidad_personaId_fkey" FOREIGN KEY ("personaId") REFERENCES "Persona"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VinculoUnidad" ADD CONSTRAINT "VinculoUnidad_unidadId_fkey" FOREIGN KEY ("unidadId") REFERENCES "Unidad"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vehiculo" ADD CONSTRAINT "Vehiculo_conjuntoId_fkey" FOREIGN KEY ("conjuntoId") REFERENCES "Conjunto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vehiculo" ADD CONSTRAINT "Vehiculo_unidadId_fkey" FOREIGN KEY ("unidadId") REFERENCES "Unidad"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vehiculo" ADD CONSTRAINT "Vehiculo_parqueaderoId_fkey" FOREIGN KEY ("parqueaderoId") REFERENCES "Parqueadero"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mascota" ADD CONSTRAINT "Mascota_conjuntoId_fkey" FOREIGN KEY ("conjuntoId") REFERENCES "Conjunto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mascota" ADD CONSTRAINT "Mascota_unidadId_fkey" FOREIGN KEY ("unidadId") REFERENCES "Unidad"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConceptoCobro" ADD CONSTRAINT "ConceptoCobro_conjuntoId_fkey" FOREIGN KEY ("conjuntoId") REFERENCES "Conjunto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cuota" ADD CONSTRAINT "Cuota_conjuntoId_fkey" FOREIGN KEY ("conjuntoId") REFERENCES "Conjunto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cuota" ADD CONSTRAINT "Cuota_unidadId_fkey" FOREIGN KEY ("unidadId") REFERENCES "Unidad"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cuota" ADD CONSTRAINT "Cuota_conceptoId_fkey" FOREIGN KEY ("conceptoId") REFERENCES "ConceptoCobro"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Multa" ADD CONSTRAINT "Multa_unidadId_fkey" FOREIGN KEY ("unidadId") REFERENCES "Unidad"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Multa" ADD CONSTRAINT "Multa_personaId_fkey" FOREIGN KEY ("personaId") REFERENCES "Persona"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pago" ADD CONSTRAINT "Pago_conjuntoId_fkey" FOREIGN KEY ("conjuntoId") REFERENCES "Conjunto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pago" ADD CONSTRAINT "Pago_unidadId_fkey" FOREIGN KEY ("unidadId") REFERENCES "Unidad"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AplicacionPago" ADD CONSTRAINT "AplicacionPago_pagoId_fkey" FOREIGN KEY ("pagoId") REFERENCES "Pago"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AplicacionPago" ADD CONSTRAINT "AplicacionPago_cuotaId_fkey" FOREIGN KEY ("cuotaId") REFERENCES "Cuota"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcuerdoPago" ADD CONSTRAINT "AcuerdoPago_unidadId_fkey" FOREIGN KEY ("unidadId") REFERENCES "Unidad"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimientoCartera" ADD CONSTRAINT "MovimientoCartera_unidadId_fkey" FOREIGN KEY ("unidadId") REFERENCES "Unidad"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CertificadoPazYSalvo" ADD CONSTRAINT "CertificadoPazYSalvo_unidadId_fkey" FOREIGN KEY ("unidadId") REFERENCES "Unidad"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConciliacionBancaria" ADD CONSTRAINT "ConciliacionBancaria_cuentaId_fkey" FOREIGN KEY ("cuentaId") REFERENCES "CuentaBancaria"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LineaExtracto" ADD CONSTRAINT "LineaExtracto_conciliacionId_fkey" FOREIGN KEY ("conciliacionId") REFERENCES "ConciliacionBancaria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GestionCobro" ADD CONSTRAINT "GestionCobro_unidadId_fkey" FOREIGN KEY ("unidadId") REFERENCES "Unidad"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reserva" ADD CONSTRAINT "Reserva_conjuntoId_fkey" FOREIGN KEY ("conjuntoId") REFERENCES "Conjunto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reserva" ADD CONSTRAINT "Reserva_zonaId_fkey" FOREIGN KEY ("zonaId") REFERENCES "ZonaComun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reserva" ADD CONSTRAINT "Reserva_unidadId_fkey" FOREIGN KEY ("unidadId") REFERENCES "Unidad"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutorizacionIngreso" ADD CONSTRAINT "AutorizacionIngreso_unidadId_fkey" FOREIGN KEY ("unidadId") REFERENCES "Unidad"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistroAcceso" ADD CONSTRAINT "RegistroAcceso_conjuntoId_fkey" FOREIGN KEY ("conjuntoId") REFERENCES "Conjunto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistroAcceso" ADD CONSTRAINT "RegistroAcceso_visitanteId_fkey" FOREIGN KEY ("visitanteId") REFERENCES "Visitante"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistroAcceso" ADD CONSTRAINT "RegistroAcceso_unidadId_fkey" FOREIGN KEY ("unidadId") REFERENCES "Unidad"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistroAcceso" ADD CONSTRAINT "RegistroAcceso_porteroId_fkey" FOREIGN KEY ("porteroId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TurnoPorteria" ADD CONSTRAINT "TurnoPorteria_porteroId_fkey" FOREIGN KEY ("porteroId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Paquete" ADD CONSTRAINT "Paquete_conjuntoId_fkey" FOREIGN KEY ("conjuntoId") REFERENCES "Conjunto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Paquete" ADD CONSTRAINT "Paquete_unidadId_fkey" FOREIGN KEY ("unidadId") REFERENCES "Unidad"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrestamoElemento" ADD CONSTRAINT "PrestamoElemento_elementoId_fkey" FOREIGN KEY ("elementoId") REFERENCES "LlaveElemento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Publicacion" ADD CONSTRAINT "Publicacion_conjuntoId_fkey" FOREIGN KEY ("conjuntoId") REFERENCES "Conjunto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Publicacion" ADD CONSTRAINT "Publicacion_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComentarioPublicacion" ADD CONSTRAINT "ComentarioPublicacion_publicacionId_fkey" FOREIGN KEY ("publicacionId") REFERENCES "Publicacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReaccionPublicacion" ADD CONSTRAINT "ReaccionPublicacion_publicacionId_fkey" FOREIGN KEY ("publicacionId") REFERENCES "Publicacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LecturaPublicacion" ADD CONSTRAINT "LecturaPublicacion_publicacionId_fkey" FOREIGN KEY ("publicacionId") REFERENCES "Publicacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CorreoSaliente" ADD CONSTRAINT "CorreoSaliente_campanaId_fkey" FOREIGN KEY ("campanaId") REFERENCES "CampanaCorreo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notificacion" ADD CONSTRAINT "Notificacion_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreguntaEncuesta" ADD CONSTRAINT "PreguntaEncuesta_encuestaId_fkey" FOREIGN KEY ("encuestaId") REFERENCES "Encuesta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RespuestaEncuesta" ADD CONSTRAINT "RespuestaEncuesta_encuestaId_fkey" FOREIGN KEY ("encuestaId") REFERENCES "Encuesta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Documento" ADD CONSTRAINT "Documento_carpetaId_fkey" FOREIGN KEY ("carpetaId") REFERENCES "CarpetaDocumento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VersionDocumento" ADD CONSTRAINT "VersionDocumento_documentoId_fkey" FOREIGN KEY ("documentoId") REFERENCES "Documento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcuseDocumento" ADD CONSTRAINT "AcuseDocumento_documentoId_fkey" FOREIGN KEY ("documentoId") REFERENCES "Documento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_conjuntoId_fkey" FOREIGN KEY ("conjuntoId") REFERENCES "Conjunto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_unidadId_fkey" FOREIGN KEY ("unidadId") REFERENCES "Unidad"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_solicitanteId_fkey" FOREIGN KEY ("solicitanteId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_zonaId_fkey" FOREIGN KEY ("zonaId") REFERENCES "ZonaComun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_activoId_fkey" FOREIGN KEY ("activoId") REFERENCES "Activo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_asignadoAId_fkey" FOREIGN KEY ("asignadoAId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComentarioTicket" ADD CONSTRAINT "ComentarioTicket_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComentarioTicket" ADD CONSTRAINT "ComentarioTicket_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LlamadoAtencion" ADD CONSTRAINT "LlamadoAtencion_unidadId_fkey" FOREIGN KEY ("unidadId") REFERENCES "Unidad"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LlamadoAtencion" ADD CONSTRAINT "LlamadoAtencion_personaId_fkey" FOREIGN KEY ("personaId") REFERENCES "Persona"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SolicitudObra" ADD CONSTRAINT "SolicitudObra_unidadId_fkey" FOREIGN KEY ("unidadId") REFERENCES "Unidad"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mudanza" ADD CONSTRAINT "Mudanza_unidadId_fkey" FOREIGN KEY ("unidadId") REFERENCES "Unidad"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asamblea" ADD CONSTRAINT "Asamblea_conjuntoId_fkey" FOREIGN KEY ("conjuntoId") REFERENCES "Conjunto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AsistenciaAsamblea" ADD CONSTRAINT "AsistenciaAsamblea_asambleaId_fkey" FOREIGN KEY ("asambleaId") REFERENCES "Asamblea"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AsistenciaAsamblea" ADD CONSTRAINT "AsistenciaAsamblea_unidadId_fkey" FOREIGN KEY ("unidadId") REFERENCES "Unidad"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PoderAsamblea" ADD CONSTRAINT "PoderAsamblea_asambleaId_fkey" FOREIGN KEY ("asambleaId") REFERENCES "Asamblea"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Votacion" ADD CONSTRAINT "Votacion_conjuntoId_fkey" FOREIGN KEY ("conjuntoId") REFERENCES "Conjunto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Votacion" ADD CONSTRAINT "Votacion_asambleaId_fkey" FOREIGN KEY ("asambleaId") REFERENCES "Asamblea"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Voto" ADD CONSTRAINT "Voto_votacionId_fkey" FOREIGN KEY ("votacionId") REFERENCES "Votacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Voto" ADD CONSTRAINT "Voto_unidadId_fkey" FOREIGN KEY ("unidadId") REFERENCES "Unidad"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activo" ADD CONSTRAINT "Activo_conjuntoId_fkey" FOREIGN KEY ("conjuntoId") REFERENCES "Conjunto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activo" ADD CONSTRAINT "Activo_zonaId_fkey" FOREIGN KEY ("zonaId") REFERENCES "ZonaComun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activo" ADD CONSTRAINT "Activo_proveedorId_fkey" FOREIGN KEY ("proveedorId") REFERENCES "Proveedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanMantenimiento" ADD CONSTRAINT "PlanMantenimiento_activoId_fkey" FOREIGN KEY ("activoId") REFERENCES "Activo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanMantenimiento" ADD CONSTRAINT "PlanMantenimiento_proveedorId_fkey" FOREIGN KEY ("proveedorId") REFERENCES "Proveedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrdenTrabajo" ADD CONSTRAINT "OrdenTrabajo_planId_fkey" FOREIGN KEY ("planId") REFERENCES "PlanMantenimiento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrdenTrabajo" ADD CONSTRAINT "OrdenTrabajo_activoId_fkey" FOREIGN KEY ("activoId") REFERENCES "Activo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrdenTrabajo" ADD CONSTRAINT "OrdenTrabajo_proveedorId_fkey" FOREIGN KEY ("proveedorId") REFERENCES "Proveedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Proveedor" ADD CONSTRAINT "Proveedor_conjuntoId_fkey" FOREIGN KEY ("conjuntoId") REFERENCES "Conjunto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentoProveedor" ADD CONSTRAINT "DocumentoProveedor_proveedorId_fkey" FOREIGN KEY ("proveedorId") REFERENCES "Proveedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalificacionProveedor" ADD CONSTRAINT "CalificacionProveedor_proveedorId_fkey" FOREIGN KEY ("proveedorId") REFERENCES "Proveedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contrato" ADD CONSTRAINT "Contrato_proveedorId_fkey" FOREIGN KEY ("proveedorId") REFERENCES "Proveedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RubroPresupuesto" ADD CONSTRAINT "RubroPresupuesto_presupuestoId_fkey" FOREIGN KEY ("presupuestoId") REFERENCES "Presupuesto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Gasto" ADD CONSTRAINT "Gasto_rubroId_fkey" FOREIGN KEY ("rubroId") REFERENCES "RubroPresupuesto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Auditoria" ADD CONSTRAINT "Auditoria_conjuntoId_fkey" FOREIGN KEY ("conjuntoId") REFERENCES "Conjunto"("id") ON DELETE SET NULL ON UPDATE CASCADE;
