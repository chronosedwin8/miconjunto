# Modelo de datos

Generado desde `prisma/schema.prisma` con `npx tsx scripts/gen-modelo-datos.ts`. 108 modelos, 91 enums.

**Convenciones:** `id` (cuid), `createdAt`, `updatedAt`, `deletedAt` (borrado lógico) en todos los modelos. Los modelos marcados con 🏢 tienen `conjuntoId` obligatorio e indexado y quedan aislados automáticamente por `withTenant`.

## SaaS

### PlanSuscripcion

| Campo | Tipo | Notas |
|---|---|---|
| id | String | PK, por defecto "cuid" |
| nombre | String |  |
| descripcion | String? |  |
| precioMensual | Decimal |  |
| precioUnidad | Decimal | por defecto 0 |
| maxUnidades | Int |  |
| modulos | String[] |  |
| activo | Boolean | por defecto true |
| conjuntos | Conjunto[] | relación |
| suscripciones | Suscripcion[] | relación |

### Suscripcion 🏢

| Campo | Tipo | Notas |
|---|---|---|
| id | String | PK, por defecto "cuid" |
| conjuntoId | String |  |
| conjunto | Conjunto | relación |
| planId | String |  |
| plan | PlanSuscripcion | relación |
| estado | EstadoSuscripcion | enum, por defecto "ACTIVA" |
| inicio | DateTime |  |
| fin | DateTime? |  |
| valor | Decimal |  |
| notas | String? |  |
| cobros | CobroSuscripcion[] | relación |

### CobroSuscripcion

| Campo | Tipo | Notas |
|---|---|---|
| id | String | PK, por defecto "cuid" |
| suscripcionId | String |  |
| suscripcion | Suscripcion | relación |
| periodo | String |  |
| valor | Decimal |  |
| pagado | Boolean | por defecto false |
| pagadoEn | DateTime? |  |

## Núcleo y estructura física

### Conjunto

| Campo | Tipo | Notas |
|---|---|---|
| id | String | PK, por defecto "cuid" |
| nombre | String |  |
| slug | String | único |
| nit | String? |  |
| digitoVerificacion | String? |  |
| direccion | String? |  |
| municipioCodigo | String? |  |
| ciudad | String? |  |
| departamento | String? |  |
| telefono | String? |  |
| email | String? |  |
| logoUrl | String? |  |
| colorPrimario | String? | por defecto "#0f766e" |
| regimenTributario | String? |  |
| responsableIva | Boolean | por defecto false |
| tipo | TipoConjunto | enum, por defecto "MIXTO" |
| matriculaInmobiliaria | String? |  |
| personeriaJuridica | String? |  |
| fechaInicioOperacion | DateTime? |  |
| planId | String? |  |
| plan | PlanSuscripcion? | relación |
| estado | EstadoConjunto | enum, por defecto "ACTIVO" |
| config | Json | por defecto "{}" |
| paginaPublica | Boolean | por defecto false |
| descripcionPublica | String? |  |
| modulosActivos | String[] |  |
| suscripciones | Suscripcion[] | relación |
| torres | Torre[] | relación |
| unidades | Unidad[] | relación |
| parqueaderos | Parqueadero[] | relación |
| bodegas | Bodega[] | relación |
| zonas | ZonaComun[] | relación |
| membresias | MembresiaConjunto[] | relación |
| roles | Rol[] | relación |
| personas | Persona[] | relación |
| vinculos | VinculoUnidad[] | relación |
| vehiculos | Vehiculo[] | relación |
| mascotas | Mascota[] | relación |
| conceptos | ConceptoCobro[] | relación |
| cuotas | Cuota[] | relación |
| pagos | Pago[] | relación |
| reservas | Reserva[] | relación |
| tickets | Ticket[] | relación |
| paquetes | Paquete[] | relación |
| registrosAcceso | RegistroAcceso[] | relación |
| publicaciones | Publicacion[] | relación |
| activos | Activo[] | relación |
| proveedores | Proveedor[] | relación |
| asambleas | Asamblea[] | relación |
| votaciones | Votacion[] | relación |
| auditorias | Auditoria[] | relación |

### Torre 🏢

| Campo | Tipo | Notas |
|---|---|---|
| id | String | PK, por defecto "cuid" |
| conjuntoId | String |  |
| conjunto | Conjunto | relación |
| nombre | String |  |
| pisos | Int | por defecto 1 |
| unidadesPorPiso | Int? |  |
| ascensores | Boolean | por defecto false |
| notas | String? |  |
| unidades | Unidad[] | relación |

Únicos compuestos: conjuntoId + nombre

### Unidad 🏢

| Campo | Tipo | Notas |
|---|---|---|
| id | String | PK, por defecto "cuid" |
| conjuntoId | String |  |
| conjunto | Conjunto | relación |
| torreId | String? |  |
| torre | Torre? | relación |
| codigo | String |  |
| tipo | TipoUnidad | enum, por defecto "APARTAMENTO" |
| piso | Int? |  |
| areaPrivada | Decimal? |  |
| areaConstruida | Decimal? |  |
| coeficiente | Decimal |  |
| matriculaInmobiliaria | String? |  |
| numeroCatastral | String? |  |
| estrato | Int? |  |
| habitaciones | Int? |  |
| banos | Int? |  |
| balconTerraza | Boolean | por defecto false |
| estadoOcupacion | EstadoOcupacion | enum, por defecto "PROPIETARIO_OCUPA" |
| plataformaRentaCorta | String? |  |
| registroRnt | String? |  |
| cuotaAdministracion | Decimal | por defecto 0 |
| notasEstructura | String? |  |
| medidores | Json | por defecto "{}" |
| tienePersonaMovilidadReducida | Boolean | por defecto false |
| requiereAsistenciaEvacuacion | Boolean | por defecto false |
| vinculos | VinculoUnidad[] | relación |
| vehiculos | Vehiculo[] | relación |
| mascotas | Mascota[] | relación |
| parqueaderos | Parqueadero[] | relación |
| bodegas | Bodega[] | relación |
| cuotas | Cuota[] | relación |
| pagos | Pago[] | relación |
| movimientos | MovimientoCartera[] | relación |
| reservas | Reserva[] | relación |
| paquetes | Paquete[] | relación |
| tickets | Ticket[] | relación |
| autorizaciones | AutorizacionIngreso[] | relación |
| registrosAcceso | RegistroAcceso[] | relación |
| multas | Multa[] | relación |
| llamados | LlamadoAtencion[] | relación |
| historialCoef | HistorialCoeficiente[] | relación |
| certificados | CertificadoPazYSalvo[] | relación |
| acuerdos | AcuerdoPago[] | relación |
| gestionesCobro | GestionCobro[] | relación |
| asistencias | AsistenciaAsamblea[] | relación |
| votos | Voto[] | relación |
| obras | SolicitudObra[] | relación |
| mudanzas | Mudanza[] | relación |

Únicos compuestos: conjuntoId + codigo

### HistorialCoeficiente 🏢

| Campo | Tipo | Notas |
|---|---|---|
| id | String | PK, por defecto "cuid" |
| conjuntoId | String |  |
| unidadId | String |  |
| unidad | Unidad | relación |
| anterior | Decimal |  |
| nuevo | Decimal |  |
| motivo | String? |  |
| usuarioId | String? |  |

### Parqueadero 🏢

| Campo | Tipo | Notas |
|---|---|---|
| id | String | PK, por defecto "cuid" |
| conjuntoId | String |  |
| conjunto | Conjunto | relación |
| codigo | String |  |
| tipo | TipoParqueadero | enum, por defecto "PRIVADO" |
| ubicacion | String? |  |
| unidadId | String? |  |
| unidad | Unidad? | relación |
| estado | EstadoEspacio | enum, por defecto "DISPONIBLE" |
| tarifaHora | Decimal? |  |
| tarifaDia | Decimal? |  |
| notas | String? |  |
| vehiculos | Vehiculo[] | relación |

Únicos compuestos: conjuntoId + codigo

### Bodega 🏢

| Campo | Tipo | Notas |
|---|---|---|
| id | String | PK, por defecto "cuid" |
| conjuntoId | String |  |
| conjunto | Conjunto | relación |
| codigo | String |  |
| ubicacion | String? |  |
| area | Decimal? |  |
| unidadId | String? |  |
| unidad | Unidad? | relación |
| estado | EstadoEspacio | enum, por defecto "DISPONIBLE" |
| notas | String? |  |

Únicos compuestos: conjuntoId + codigo

### ZonaComun 🏢

| Campo | Tipo | Notas |
|---|---|---|
| id | String | PK, por defecto "cuid" |
| conjuntoId | String |  |
| conjunto | Conjunto | relación |
| nombre | String |  |
| tipo | String? |  |
| categoria | CategoriaZona | enum, por defecto "OTRA" |
| descripcion | String? |  |
| fotos | String[] |  |
| capacidad | Int? |  |
| horario | Json | por defecto "{}" |
| reservable | Boolean | por defecto true |
| requiereAprobacion | Boolean | por defecto false |
| tarifa | Decimal | por defecto 0 |
| deposito | Decimal | por defecto 0 |
| duracionMinimaMin | Int | por defecto 60 |
| duracionMaximaMin | Int | por defecto 240 |
| anticipacionMinimaHoras | Int | por defecto 24 |
| anticipacionMaximaDias | Int | por defecto 60 |
| maxReservasMesUnidad | Int | por defecto 4 |
| reglasUso | String? |  |
| bloqueoPorMora | Boolean | por defecto true |
| gravaIva | Boolean | por defecto false |
| tarifaIva | Decimal | por defecto 19 |
| generaFactura | Boolean | por defecto false |
| politicaCancelacion | String? |  |
| horasCancelacionReembolso | Int | por defecto 48 |
| estado | EstadoZona | enum, por defecto "ACTIVA" |
| reservas | Reserva[] | relación |
| bloqueos | BloqueoZona[] | relación |
| reglas | ReglaReserva[] | relación |
| tickets | Ticket[] | relación |
| activos | Activo[] | relación |

### BloqueoZona 🏢

| Campo | Tipo | Notas |
|---|---|---|
| id | String | PK, por defecto "cuid" |
| conjuntoId | String |  |
| zonaId | String |  |
| zona | ZonaComun | relación |
| inicio | DateTime |  |
| fin | DateTime |  |
| motivo | String |  |
| tipo | String | por defecto "MANTENIMIENTO" |

### ReglaReserva 🏢

| Campo | Tipo | Notas |
|---|---|---|
| id | String | PK, por defecto "cuid" |
| conjuntoId | String |  |
| zonaId | String |  |
| zona | ZonaComun | relación |
| tipo | String |  |
| valor | Json | por defecto "{}" |
| descripcion | String? |  |
| activa | Boolean | por defecto true |

## Usuarios, roles y acceso

### Usuario

| Campo | Tipo | Notas |
|---|---|---|
| id | String | PK, por defecto "cuid" |
| email | String | único |
| telefono | String? |  |
| passwordHash | String? |  |
| nombre | String |  |
| fotoUrl | String? |  |
| estado | EstadoUsuario | enum, por defecto "ACTIVO" |
| ultimoAcceso | DateTime? |  |
| preferenciasNotif | Json | por defecto "{\"push\":true,\"email\":true,\"whatsapp\":false}" |
| politicaAceptadaEn | DateTime? |  |
| politicaVersion | String? |  |
| mfaSecret | String? |  |
| mfaActivo | Boolean | por defecto false |
| esSuperAdmin | Boolean | por defecto false |
| intentosFallidos | Int | por defecto 0 |
| bloqueadoHasta | DateTime? |  |
| sessionVersion | Int | por defecto 0 |
| textoGrande | Boolean | por defecto false |
| membresias | MembresiaConjunto[] | relación |
| personas | Persona[] | relación |
| notificaciones | Notificacion[] | relación |
| suscripcionesPush | SuscripcionPush[] | relación |
| ticketsSolicitados | Ticket[] | relación |
| ticketsAsignados | Ticket[] | relación |
| comentariosTicket | ComentarioTicket[] | relación |
| publicaciones | Publicacion[] | relación |
| registrosPorteria | RegistroAcceso[] | relación |
| turnos | TurnoPorteria[] | relación |

### MembresiaConjunto 🏢

| Campo | Tipo | Notas |
|---|---|---|
| id | String | PK, por defecto "cuid" |
| usuarioId | String |  |
| usuario | Usuario | relación |
| conjuntoId | String |  |
| conjunto | Conjunto | relación |
| rolId | String |  |
| rol | Rol | relación |
| personaId | String? |  |
| estado | EstadoMembresia | enum, por defecto "ACTIVA" |

Únicos compuestos: usuarioId + conjuntoId

### Rol 🏢

| Campo | Tipo | Notas |
|---|---|---|
| id | String | PK, por defecto "cuid" |
| conjuntoId | String |  |
| conjunto | Conjunto | relación |
| clave | String |  |
| nombre | String |  |
| descripcion | String? |  |
| base | Boolean | por defecto false |
| basadoEnClave | String? |  |
| version | Int | por defecto 0 |
| permisos | RolPermiso[] | relación |
| membresias | MembresiaConjunto[] | relación |

Únicos compuestos: conjuntoId + clave

### Permiso

| Campo | Tipo | Notas |
|---|---|---|
| id | String | PK, por defecto "cuid" |
| clave | String | único |
| modulo | String |  |
| accion | String |  |
| descripcion | String |  |
| tipo | String | por defecto "ACCION" |

### RolPermiso 🏢

| Campo | Tipo | Notas |
|---|---|---|
| id | String | PK, por defecto "cuid" |
| conjuntoId | String |  |
| rolId | String |  |
| rol | Rol | relación |
| permisoClave | String |  |

Únicos compuestos: rolId + permisoClave

### TokenVerificacion

| Campo | Tipo | Notas |
|---|---|---|
| id | String | PK, por defecto "cuid" |
| tipo | TipoToken | enum |
| tokenHash | String | único |
| email | String? |  |
| usuarioId | String? |  |
| conjuntoId | String? |  |
| data | Json | por defecto "{}" |
| expira | DateTime |  |
| usadoEn | DateTime? |  |

### Invitacion 🏢

| Campo | Tipo | Notas |
|---|---|---|
| id | String | PK, por defecto "cuid" |
| conjuntoId | String |  |
| email | String |  |
| telefono | String? |  |
| nombre | String? |  |
| unidadId | String? |  |
| personaId | String? |  |
| rolClave | String |  |
| tipoVinculo | TipoVinculo? | enum |
| invitadoPorId | String? |  |
| tokenHash | String | único |
| estado | EstadoInvitacion | enum, por defecto "PENDIENTE" |
| expira | DateTime |  |
| aceptadaEn | DateTime? |  |

### SuscripcionPush

| Campo | Tipo | Notas |
|---|---|---|
| id | String | PK, por defecto "cuid" |
| usuarioId | String |  |
| usuario | Usuario | relación |
| endpoint | String | único |
| p256dh | String |  |
| auth | String |  |
| userAgent | String? |  |

### TokenApi 🏢

| Campo | Tipo | Notas |
|---|---|---|
| id | String | PK, por defecto "cuid" |
| conjuntoId | String |  |
| nombre | String |  |
| tokenHash | String | único |
| prefijo | String |  |
| permisos | String[] |  |
| ultimoUso | DateTime? |  |
| revocado | Boolean | por defecto false |
| creadoPorId | String? |  |

### WebhookSaliente 🏢

| Campo | Tipo | Notas |
|---|---|---|
| id | String | PK, por defecto "cuid" |
| conjuntoId | String |  |
| url | String |  |
| eventos | String[] |  |
| secreto | String |  |
| activo | Boolean | por defecto true |
| entregas | EntregaWebhook[] | relación |

### EntregaWebhook 🏢

| Campo | Tipo | Notas |
|---|---|---|
| id | String | PK, por defecto "cuid" |
| conjuntoId | String |  |
| webhookId | String |  |
| webhook | WebhookSaliente | relación |
| evento | String |  |
| payload | Json |  |
| estado | String | por defecto "PENDIENTE" |
| intentos | Int | por defecto 0 |
| respuesta | String? |  |

## Personas

### Persona 🏢

| Campo | Tipo | Notas |
|---|---|---|
| id | String | PK, por defecto "cuid" |
| conjuntoId | String |  |
| conjunto | Conjunto | relación |
| usuarioId | String? |  |
| usuario | Usuario? | relación |
| tipoDocumento | TipoDocumento | enum, por defecto "CC" |
| numeroDocumento | String |  |
| nombres | String |  |
| apellidos | String |  |
| fechaNacimiento | DateTime? |  |
| genero | String? |  |
| fotoUrl | String? |  |
| telefono | String? |  |
| email | String? |  |
| eps | String? |  |
| contactoEmergenciaNombre | String? |  |
| contactoEmergenciaTelefono | String? |  |
| ocupacion | String? |  |
| movilidadReducida | Boolean | por defecto false |
| movilidadDescripcion | String? |  |
| requiereAsistenciaEvacuacion | Boolean | por defecto false |
| tipoSangre | String? |  |
| observaciones | String? |  |
| directorioOptIn | Boolean | por defecto false |
| directorioCampos | String[] |  |
| serviciosOfrecidos | String? |  |
| consentimientoDatosEn | DateTime? |  |
| consentimientoVersion | String? |  |
| anonimizada | Boolean | por defecto false |
| vinculos | VinculoUnidad[] | relación |
| multas | Multa[] | relación |
| llamados | LlamadoAtencion[] | relación |

Únicos compuestos: conjuntoId + tipoDocumento + numeroDocumento

### VinculoUnidad 🏢

| Campo | Tipo | Notas |
|---|---|---|
| id | String | PK, por defecto "cuid" |
| conjuntoId | String |  |
| conjunto | Conjunto | relación |
| personaId | String |  |
| persona | Persona | relación |
| unidadId | String |  |
| unidad | Unidad | relación |
| tipo | TipoVinculo | enum |
| porcentajePropiedad | Decimal? |  |
| fechaInicio | DateTime | por defecto "now" |
| fechaFin | DateTime? |  |
| principal | Boolean | por defecto false |
| horarioPermitido | Json? |  |
| estado | EstadoVinculo | enum, por defecto "ACTIVO" |
| puedeVerCuenta | Boolean | por defecto false |
| aprobadoPorId | String? |  |

### Vehiculo 🏢

| Campo | Tipo | Notas |
|---|---|---|
| id | String | PK, por defecto "cuid" |
| conjuntoId | String |  |
| conjunto | Conjunto | relación |
| unidadId | String |  |
| unidad | Unidad | relación |
| placa | String |  |
| tipo | TipoVehiculo | enum, por defecto "CARRO" |
| marca | String? |  |
| modelo | String? |  |
| color | String? |  |
| fotoUrl | String? |  |
| tarjetaPropiedadUrl | String? |  |
| soatVence | DateTime? |  |
| tecnomecanicaVence | DateTime? |  |
| parqueaderoId | String? |  |
| parqueadero | Parqueadero? | relación |
| activo | Boolean | por defecto true |

Únicos compuestos: conjuntoId + placa

### Mascota 🏢

| Campo | Tipo | Notas |
|---|---|---|
| id | String | PK, por defecto "cuid" |
| conjuntoId | String |  |
| conjunto | Conjunto | relación |
| unidadId | String |  |
| unidad | Unidad | relación |
| nombre | String |  |
| especie | String |  |
| raza | String? |  |
| color | String? |  |
| fotoUrl | String? |  |
| carneVacunasUrl | String? |  |
| antirrabicaVence | DateTime? |  |
| potencialmentePeligrosa | Boolean | por defecto false |
| polizaUrl | String? |  |
| microchip | String? |  |
| activo | Boolean | por defecto true |

### BorradorFormulario 🏢

| Campo | Tipo | Notas |
|---|---|---|
| id | String | PK, por defecto "cuid" |
| conjuntoId | String |  |
| usuarioId | String |  |
| clave | String |  |
| datos | Json |  |

Únicos compuestos: usuarioId + conjuntoId + clave

## Cartera y recaudo

### ConceptoCobro 🏢

| Campo | Tipo | Notas |
|---|---|---|
| id | String | PK, por defecto "cuid" |
| conjuntoId | String |  |
| conjunto | Conjunto | relación |
| nombre | String |  |
| tipo | TipoConcepto | enum |
| cuentaContable | String? |  |
| gravaIva | Boolean | por defecto false |
| tarifaIva | Decimal | por defecto 0 |
| facturaElectronica | Boolean | por defecto false |
| activo | Boolean | por defecto true |
| cuotas | Cuota[] | relación |

### Cuota 🏢

| Campo | Tipo | Notas |
|---|---|---|
| id | String | PK, por defecto "cuid" |
| conjuntoId | String |  |
| conjunto | Conjunto | relación |
| unidadId | String |  |
| unidad | Unidad | relación |
| conceptoId | String |  |
| concepto | ConceptoCobro | relación |
| periodo | String |  |
| descripcion | String? |  |
| fechaEmision | DateTime |  |
| fechaVencimiento | DateTime |  |
| fechaProntoPago | DateTime? |  |
| porcentajeProntoPago | Decimal | por defecto 0 |
| valorBase | Decimal |  |
| iva | Decimal | por defecto 0 |
| descuento | Decimal | por defecto 0 |
| interes | Decimal | por defecto 0 |
| saldo | Decimal |  |
| estado | EstadoCuota | enum, por defecto "PENDIENTE" |
| referenciaPago | String | único |
| origen | OrigenCuota | enum, por defecto "MANUAL" |
| cuotaExtraordinariaId | String? |  |
| cuotaOrigenId | String? |  |
| acuerdoId | String? |  |
| interesCausadoHasta | DateTime? |  |
| aplicaciones | AplicacionPago[] | relación |

### CuotaExtraordinaria 🏢

| Campo | Tipo | Notas |
|---|---|---|
| id | String | PK, por defecto "cuid" |
| conjuntoId | String |  |
| nombre | String |  |
| motivo | String? |  |
| asambleaId | String? |  |
| valorTotal | Decimal |  |
| distribucion | DistribucionCuota | enum, por defecto "POR_COEFICIENTE" |
| numeroCuotas | Int | por defecto 1 |
| fechaPrimeraCuota | DateTime |  |
| diaVencimiento | Int | por defecto 10 |
| distribucionManual | Json? |  |
| generada | Boolean | por defecto false |

### CatalogoInfraccion 🏢

| Campo | Tipo | Notas |
|---|---|---|
| id | String | PK, por defecto "cuid" |
| conjuntoId | String |  |
| codigo | String |  |
| nombre | String |  |
| descripcion | String? |  |
| valorSugerido | Decimal | por defecto 0 |
| gravedad | GravedadLlamado | enum, por defecto "LEVE" |
| articulo | String? |  |
| activo | Boolean | por defecto true |

Únicos compuestos: conjuntoId + codigo

### Multa 🏢

| Campo | Tipo | Notas |
|---|---|---|
| id | String | PK, por defecto "cuid" |
| conjuntoId | String |  |
| unidadId | String |  |
| unidad | Unidad | relación |
| personaId | String? |  |
| persona | Persona? | relación |
| infraccionId | String? |  |
| llamadoId | String? |  |
| descripcion | String |  |
| evidencias | String[] |  |
| valor | Decimal |  |
| fecha | DateTime | por defecto "now" |
| estado | EstadoMulta | enum, por defecto "PROPUESTA" |
| notificadaEn | DateTime? |  |
| plazoDescargos | DateTime? |  |
| descargos | String? |  |
| descargosEn | DateTime? |  |
| resolucion | String? |  |
| resolucionEn | DateTime? |  |
| decididaPorId | String? |  |
| cuotaId | String? |  |

### Pago 🏢

| Campo | Tipo | Notas |
|---|---|---|
| id | String | PK, por defecto "cuid" |
| conjuntoId | String |  |
| conjunto | Conjunto | relación |
| unidadId | String |  |
| unidad | Unidad | relación |
| valor | Decimal |  |
| fecha | DateTime | por defecto "now" |
| medio | MedioPago | enum |
| pasarela | Pasarela | enum, por defecto "NINGUNA" |
| referencia | String | único |
| referenciaExterna | String? |  |
| estado | EstadoPago | enum, por defecto "PENDIENTE" |
| comprobanteUrl | String? |  |
| registradoPorId | String? |  |
| conciliado | Boolean | por defecto false |
| numeroRecibo | Int? |  |
| datosPasarela | Json? |  |
| cuotasSeleccionadas | String[] |  |
| observaciones | String? |  |
| reservaId | String? |  |
| pagadorNombre | String? |  |
| pagadorEmail | String? |  |
| pagadorDocumento | String? |  |
| aplicaciones | AplicacionPago[] | relación |

### AplicacionPago 🏢

| Campo | Tipo | Notas |
|---|---|---|
| id | String | PK, por defecto "cuid" |
| conjuntoId | String |  |
| pagoId | String |  |
| pago | Pago | relación |
| cuotaId | String |  |
| cuota | Cuota | relación |
| valor | Decimal |  |

### AcuerdoPago 🏢

| Campo | Tipo | Notas |
|---|---|---|
| id | String | PK, por defecto "cuid" |
| conjuntoId | String |  |
| unidadId | String |  |
| unidad | Unidad | relación |
| saldoInicial | Decimal |  |
| numeroCuotas | Int |  |
| valorCuota | Decimal |  |
| fechaInicio | DateTime |  |
| diaPago | Int | por defecto 10 |
| estado | EstadoAcuerdo | enum, por defecto "VIGENTE" |
| documentoUrl | String? |  |
| observaciones | String? |  |
| creadoPorId | String? |  |

### MovimientoCartera 🏢

| Campo | Tipo | Notas |
|---|---|---|
| id | String | PK, por defecto "cuid" |
| conjuntoId | String |  |
| unidadId | String |  |
| unidad | Unidad | relación |
| fecha | DateTime | por defecto "now" |
| tipo | TipoMovimiento | enum |
| valor | Decimal |  |
| conceptoTipo | TipoConcepto? | enum |
| cuotaId | String? |  |
| pagoId | String? |  |
| descripcion | String |  |

### CertificadoPazYSalvo 🏢

| Campo | Tipo | Notas |
|---|---|---|
| id | String | PK, por defecto "cuid" |
| conjuntoId | String |  |
| unidadId | String |  |
| unidad | Unidad | relación |
| personaNombre | String? |  |
| solicitadoPorId | String? |  |
| fecha | DateTime | por defecto "now" |
| vigenteHasta | DateTime |  |
| codigo | String | único |
| estado | EstadoCertificado | enum, por defecto "VIGENTE" |
| emitidoPorId | String? |  |
| automatico | Boolean | por defecto true |
| observaciones | String? |  |

### CuentaBancaria 🏢

| Campo | Tipo | Notas |
|---|---|---|
| id | String | PK, por defecto "cuid" |
| conjuntoId | String |  |
| banco | String |  |
| tipo | String | por defecto "AHORROS" |
| numero | String |  |
| titular | String |  |
| convenio | String? |  |
| activa | Boolean | por defecto true |
| conciliaciones | ConciliacionBancaria[] | relación |

### ConciliacionBancaria 🏢

| Campo | Tipo | Notas |
|---|---|---|
| id | String | PK, por defecto "cuid" |
| conjuntoId | String |  |
| cuentaId | String? |  |
| cuenta | CuentaBancaria? | relación |
| archivoNombre | String |  |
| periodo | String? |  |
| estado | String | por defecto "EN_PROCESO" |
| totalLineas | Int | por defecto 0 |
| emparejadas | Int | por defecto 0 |
| lineas | LineaExtracto[] | relación |
| creadoPorId | String? |  |

### LineaExtracto 🏢

| Campo | Tipo | Notas |
|---|---|---|
| id | String | PK, por defecto "cuid" |
| conjuntoId | String |  |
| conciliacionId | String |  |
| conciliacion | ConciliacionBancaria | relación |
| fecha | DateTime |  |
| descripcion | String? |  |
| referencia | String? |  |
| valor | Decimal |  |
| estado | EstadoLineaExtracto | enum, por defecto "PENDIENTE" |
| pagoId | String? |  |
| unidadSugeridaId | String? |  |

### GestionCobro 🏢

| Campo | Tipo | Notas |
|---|---|---|
| id | String | PK, por defecto "cuid" |
| conjuntoId | String |  |
| unidadId | String |  |
| unidad | Unidad | relación |
| canal | CanalCobro | enum |
| fecha | DateTime | por defecto "now" |
| resultado | String? |  |
| notas | String? |  |
| usuarioId | String? |  |

### Consecutivo 🏢

| Campo | Tipo | Notas |
|---|---|---|
| id | String | PK, por defecto "cuid" |
| conjuntoId | String |  |
| tipo | String |  |
| anio | Int | por defecto 0 |
| valor | Int | por defecto 0 |

Únicos compuestos: conjuntoId + tipo + anio

### TasaMora 🏢

| Campo | Tipo | Notas |
|---|---|---|
| id | String | PK, por defecto "cuid" |
| conjuntoId | String |  |
| vigenteDesde | DateTime |  |
| tasaEfectivaAnual | Decimal |  |
| tasaMensual | Decimal |  |
| fuente | String? |  |

## Reservas y facturación

### Reserva 🏢

| Campo | Tipo | Notas |
|---|---|---|
| id | String | PK, por defecto "cuid" |
| conjuntoId | String |  |
| conjunto | Conjunto | relación |
| zonaId | String |  |
| zona | ZonaComun | relación |
| unidadId | String |  |
| unidad | Unidad | relación |
| personaId | String? |  |
| usuarioId | String? |  |
| inicio | DateTime |  |
| fin | DateTime |  |
| asistentes | Int | por defecto 1 |
| motivo | String? |  |
| estado | EstadoReserva | enum, por defecto "SOLICITADA" |
| valor | Decimal | por defecto 0 |
| iva | Decimal | por defecto 0 |
| deposito | Decimal | por defecto 0 |
| cuotaId | String? |  |
| pagoId | String? |  |
| pagada | Boolean | por defecto false |
| checkInEn | DateTime? |  |
| checkInPorId | String? |  |
| checkOutEn | DateTime? |  |
| checkOutPorId | String? |  |
| actaEntrega | Json? |  |
| actaRecepcion | Json? |  |
| actaFotos | String[] |  |
| calificacion | Int? |  |
| comentarioCalificacion | String? |  |
| canceladaEn | DateTime? |  |
| motivoCancelacion | String? |  |
| aprobadaPorId | String? |  |

### FacturaElectronica 🏢

| Campo | Tipo | Notas |
|---|---|---|
| id | String | PK, por defecto "cuid" |
| conjuntoId | String |  |
| tipo | TipoDocumentoElectronico | enum, por defecto "FACTURA" |
| proveedor | String | por defecto "FACTUS" |
| reservaId | String? |  |
| pagoId | String? |  |
| facturaOrigenId | String? |  |
| referenceCode | String | único |
| numero | String? |  |
| cufe | String? |  |
| estado | EstadoFactura | enum, por defecto "PENDIENTE" |
| validadaEn | DateTime? |  |
| urlPublica | String? |  |
| qr | String? |  |
| pdfUrl | String? |  |
| xmlUrl | String? |  |
| errores | Json? |  |
| intentos | Int | por defecto 0 |
| payload | Json? |  |
| respuesta | Json? |  |
| subtotal | Decimal |  |
| iva | Decimal |  |
| total | Decimal |  |
| clienteNombre | String |  |
| clienteDocumento | String |  |
| clienteEmail | String? |  |
| descripcion | String |  |

### TablaReferencia

| Campo | Tipo | Notas |
|---|---|---|
| id | String | PK, por defecto "cuid" |
| fuente | String |  |
| tipo | String |  |
| codigo | String |  |
| nombre | String |  |
| extra | Json? |  |

Únicos compuestos: fuente + tipo + codigo

## Portería

### Visitante 🏢

| Campo | Tipo | Notas |
|---|---|---|
| id | String | PK, por defecto "cuid" |
| conjuntoId | String |  |
| tipoDocumento | TipoDocumento | enum, por defecto "CC" |
| numeroDocumento | String? |  |
| nombre | String |  |
| fotoUrl | String? |  |
| telefono | String? |  |
| empresa | String? |  |
| tipo | TipoVisitante | enum, por defecto "VISITA" |
| listaNegra | Boolean | por defecto false |
| motivoListaNegra | String? |  |
| registros | RegistroAcceso[] | relación |

### AutorizacionIngreso 🏢

| Campo | Tipo | Notas |
|---|---|---|
| id | String | PK, por defecto "cuid" |
| conjuntoId | String |  |
| unidadId | String |  |
| unidad | Unidad | relación |
| creadaPorId | String? |  |
| visitanteId | String? |  |
| nombreVisitante | String |  |
| documentoVisitante | String? |  |
| tipo | TipoVisitante | enum, por defecto "VISITA" |
| fechaInicio | DateTime |  |
| fechaFin | DateTime |  |
| recurrente | Boolean | por defecto false |
| diasSemana | Int[] |  |
| horaInicio | String? |  |
| horaFin | String? |  |
| placa | String? |  |
| codigo | String |  |
| qrToken | String | único |
| estado | EstadoAutorizacion | enum, por defecto "ACTIVA" |
| usosPermitidos | Int | por defecto 1 |
| usos | Int | por defecto 0 |
| observaciones | String? |  |
| soporteSeguridadSocialUrl | String? |  |

### SolicitudIngreso 🏢

| Campo | Tipo | Notas |
|---|---|---|
| id | String | PK, por defecto "cuid" |
| conjuntoId | String |  |
| unidadId | String |  |
| visitanteNombre | String |  |
| visitanteDocumento | String? |  |
| tipo | TipoVisitante | enum, por defecto "VISITA" |
| fotoUrl | String? |  |
| placa | String? |  |
| estado | EstadoSolicitudIngreso | enum, por defecto "PENDIENTE" |
| respondidaPorId | String? |  |
| respondidaEn | DateTime? |  |
| porteroId | String? |  |
| registroAccesoId | String? |  |
| expiraEn | DateTime |  |

### RegistroAcceso 🏢

| Campo | Tipo | Notas |
|---|---|---|
| id | String | PK, por defecto "cuid" |
| conjuntoId | String |  |
| conjunto | Conjunto | relación |
| tipo | TipoRegistroAcceso | enum |
| sujeto | SujetoAcceso | enum, por defecto "VISITANTE" |
| visitanteId | String? |  |
| visitante | Visitante? | relación |
| personaId | String? |  |
| nombre | String |  |
| documento | String? |  |
| unidadId | String? |  |
| unidad | Unidad? | relación |
| autorizacionId | String? |  |
| medio | MedioAcceso | enum, por defecto "MANUAL" |
| placa | String? |  |
| parqueaderoId | String? |  |
| hora | DateTime | por defecto "now" |
| porteroId | String? |  |
| portero | Usuario? | relación |
| fotoUrl | String? |  |
| observaciones | String? |  |
| ingresoId | String? |  |
| anulaId | String? |  |
| clienteId | String? | único |

### TurnoPorteria 🏢

| Campo | Tipo | Notas |
|---|---|---|
| id | String | PK, por defecto "cuid" |
| conjuntoId | String |  |
| porteroId | String |  |
| portero | Usuario | relación |
| apertura | DateTime | por defecto "now" |
| cierre | DateTime? |  |
| novedadesApertura | String? |  |
| novedadesCierre | String? |  |
| checklistApertura | Json | por defecto "[]" |
| checklistCierre | Json? |  |
| firmaApertura | String? |  |
| firmaCierre | String? |  |
| estado | EstadoTurno | enum, por defecto "ABIERTO" |

### Novedad 🏢

| Campo | Tipo | Notas |
|---|---|---|
| id | String | PK, por defecto "cuid" |
| conjuntoId | String |  |
| turnoId | String? |  |
| tipo | TipoNovedad | enum |
| severidad | Severidad | enum, por defecto "BAJA" |
| descripcion | String |  |
| fotos | String[] |  |
| unidadId | String? |  |
| reportadoPorId | String? |  |
| notificada | Boolean | por defecto false |
| ticketId | String? |  |
| clienteId | String? | único |

### Paquete 🏢

| Campo | Tipo | Notas |
|---|---|---|
| id | String | PK, por defecto "cuid" |
| conjuntoId | String |  |
| conjunto | Conjunto | relación |
| unidadId | String |  |
| unidad | Unidad | relación |
| destinatario | String? |  |
| transportadora | String? |  |
| guia | String? |  |
| tipo | TipoPaquete | enum, por defecto "CAJA" |
| fotoUrl | String? |  |
| fotoGuiaUrl | String? |  |
| llegadaEn | DateTime | por defecto "now" |
| recibidoPorId | String? |  |
| estado | EstadoPaquete | enum, por defecto "EN_PORTERIA" |
| entregadoEn | DateTime? |  |
| entregadoPorId | String? |  |
| recogidoPor | String? |  |
| recogidoPorPersonaId | String? |  |
| firmaEntrega | String? |  |
| fotoEntregaUrl | String? |  |
| notificadoEn | DateTime? |  |
| observaciones | String? |  |
| clienteId | String? | único |

### LlaveElemento 🏢

| Campo | Tipo | Notas |
|---|---|---|
| id | String | PK, por defecto "cuid" |
| conjuntoId | String |  |
| nombre | String |  |
| tipo | TipoElemento | enum, por defecto "LLAVE" |
| codigo | String? |  |
| ubicacion | String? |  |
| estado | EstadoElemento | enum, por defecto "DISPONIBLE" |
| notas | String? |  |
| prestamos | PrestamoElemento[] | relación |

### PrestamoElemento 🏢

| Campo | Tipo | Notas |
|---|---|---|
| id | String | PK, por defecto "cuid" |
| conjuntoId | String |  |
| elementoId | String |  |
| elemento | LlaveElemento | relación |
| prestadoA | String |  |
| unidadId | String? |  |
| prestadoEn | DateTime | por defecto "now" |
| devueltoEn | DateTime? |  |
| porteroId | String? |  |
| observaciones | String? |  |

### AlertaEmergencia 🏢

| Campo | Tipo | Notas |
|---|---|---|
| id | String | PK, por defecto "cuid" |
| conjuntoId | String |  |
| tipo | TipoAlerta | enum |
| origen | String |  |
| unidadId | String? |  |
| usuarioId | String? |  |
| mensaje | String? |  |
| alcance | String | por defecto "ADMIN_CONSEJO" |
| estado | EstadoAlerta | enum, por defecto "ACTIVA" |
| atendidaEn | DateTime? |  |
| atendidaPorId | String? |  |

## Comunicaciones

### Segmento 🏢

| Campo | Tipo | Notas |
|---|---|---|
| id | String | PK, por defecto "cuid" |
| conjuntoId | String |  |
| nombre | String |  |
| descripcion | String? |  |
| definicion | Json |  |

### Publicacion 🏢

| Campo | Tipo | Notas |
|---|---|---|
| id | String | PK, por defecto "cuid" |
| conjuntoId | String |  |
| conjunto | Conjunto | relación |
| autorId | String |  |
| autor | Usuario | relación |
| titulo | String |  |
| contenido | Json | por defecto "[]" |
| resumen | String? |  |
| categoria | CategoriaPublicacion | enum, por defecto "AVISO" |
| segmentoId | String? |  |
| audiencia | Json? |  |
| fijada | Boolean | por defecto false |
| permiteComentarios | Boolean | por defecto true |
| venceEn | DateTime? |  |
| estado | EstadoPublicacion | enum, por defecto "PUBLICADA" |
| encuestaId | String? |  |
| precio | Decimal? |  |
| imagenes | String[] |  |
| comentarios | ComentarioPublicacion[] | relación |
| reacciones | ReaccionPublicacion[] | relación |
| lecturas | LecturaPublicacion[] | relación |

### ComentarioPublicacion 🏢

| Campo | Tipo | Notas |
|---|---|---|
| id | String | PK, por defecto "cuid" |
| conjuntoId | String |  |
| publicacionId | String |  |
| publicacion | Publicacion | relación |
| autorId | String |  |
| autorNombre | String |  |
| contenido | String |  |
| oculto | Boolean | por defecto false |
| moderadoPorId | String? |  |

### ReaccionPublicacion 🏢

| Campo | Tipo | Notas |
|---|---|---|
| id | String | PK, por defecto "cuid" |
| conjuntoId | String |  |
| publicacionId | String |  |
| publicacion | Publicacion | relación |
| usuarioId | String |  |
| tipo | String | por defecto "LIKE" |

Únicos compuestos: publicacionId + usuarioId

### LecturaPublicacion 🏢

| Campo | Tipo | Notas |
|---|---|---|
| id | String | PK, por defecto "cuid" |
| conjuntoId | String |  |
| publicacionId | String |  |
| publicacion | Publicacion | relación |
| usuarioId | String |  |

Únicos compuestos: publicacionId + usuarioId

### CampanaCorreo 🏢

| Campo | Tipo | Notas |
|---|---|---|
| id | String | PK, por defecto "cuid" |
| conjuntoId | String |  |
| asunto | String |  |
| plantilla | String |  |
| tipo | TipoCampana | enum, por defecto "GENERAL" |
| segmentoId | String? |  |
| definicionSegmento | Json? |  |
| adjuntos | String[] |  |
| programadaPara | DateTime? |  |
| estado | EstadoCampana | enum, por defecto "BORRADOR" |
| totalDestinatarios | Int | por defecto 0 |
| enviados | Int | por defecto 0 |
| rebotes | Int | por defecto 0 |
| aperturas | Int | por defecto 0 |
| clics | Int | por defecto 0 |
| creadaPorId | String? |  |
| correos | CorreoSaliente[] | relación |

### CorreoSaliente

| Campo | Tipo | Notas |
|---|---|---|
| id | String | PK, por defecto "cuid" |
| conjuntoId | String? |  |
| campanaId | String? |  |
| campana | CampanaCorreo? | relación |
| para | String |  |
| asunto | String |  |
| html | String |  |
| texto | String? |  |
| adjuntos | Json? |  |
| estado | EstadoCorreo | enum, por defecto "PENDIENTE" |
| intentos | Int | por defecto 0 |
| error | String? |  |
| enviadoEn | DateTime? |  |
| abiertoEn | DateTime? |  |
| clicEn | DateTime? |  |
| trackingId | String | único, por defecto "cuid" |

### Notificacion

| Campo | Tipo | Notas |
|---|---|---|
| id | String | PK, por defecto "cuid" |
| conjuntoId | String? |  |
| usuarioId | String |  |
| usuario | Usuario | relación |
| titulo | String |  |
| cuerpo | String |  |
| tipo | String | por defecto "GENERAL" |
| enlace | String? |  |
| canales | String[] |  |
| leida | Boolean | por defecto false |
| leidaEn | DateTime? |  |
| data | Json? |  |

### Encuesta 🏢

| Campo | Tipo | Notas |
|---|---|---|
| id | String | PK, por defecto "cuid" |
| conjuntoId | String |  |
| titulo | String |  |
| descripcion | String? |  |
| segmentoId | String? |  |
| anonima | Boolean | por defecto false |
| inicio | DateTime | por defecto "now" |
| fin | DateTime |  |
| estado | EstadoEncuesta | enum, por defecto "ABIERTA" |
| creadaPorId | String? |  |
| preguntas | PreguntaEncuesta[] | relación |
| respuestas | RespuestaEncuesta[] | relación |

### PreguntaEncuesta 🏢

| Campo | Tipo | Notas |
|---|---|---|
| id | String | PK, por defecto "cuid" |
| conjuntoId | String |  |
| encuestaId | String |  |
| encuesta | Encuesta | relación |
| orden | Int |  |
| tipo | TipoPregunta | enum |
| texto | String |  |
| opciones | String[] |  |
| requerida | Boolean | por defecto true |

### RespuestaEncuesta 🏢

| Campo | Tipo | Notas |
|---|---|---|
| id | String | PK, por defecto "cuid" |
| conjuntoId | String |  |
| encuestaId | String |  |
| encuesta | Encuesta | relación |
| usuarioId | String? |  |
| unidadId | String? |  |
| respuestas | Json |  |
| votanteHash | String |  |

Únicos compuestos: encuestaId + votanteHash

### CarpetaDocumento 🏢

| Campo | Tipo | Notas |
|---|---|---|
| id | String | PK, por defecto "cuid" |
| conjuntoId | String |  |
| nombre | String |  |
| padreId | String? |  |
| rolesVisibles | String[] |  |
| documentos | Documento[] | relación |

### Documento 🏢

| Campo | Tipo | Notas |
|---|---|---|
| id | String | PK, por defecto "cuid" |
| conjuntoId | String |  |
| carpetaId | String? |  |
| carpeta | CarpetaDocumento? | relación |
| titulo | String |  |
| descripcion | String? |  |
| categoria | CategoriaDocumento | enum, por defecto "OTRO" |
| rolesVisibles | String[] |  |
| requiereAcuse | Boolean | por defecto false |
| versionActual | Int | por defecto 1 |
| vence | DateTime? |  |
| publicado | Boolean | por defecto true |
| codigoVerificacion | String? | único |
| versiones | VersionDocumento[] | relación |
| acuses | AcuseDocumento[] | relación |

### VersionDocumento 🏢

| Campo | Tipo | Notas |
|---|---|---|
| id | String | PK, por defecto "cuid" |
| conjuntoId | String |  |
| documentoId | String |  |
| documento | Documento | relación |
| version | Int |  |
| archivoUrl | String |  |
| nombreArchivo | String |  |
| mime | String |  |
| tamano | Int |  |
| subidoPorId | String? |  |
| notas | String? |  |
| textoExtraido | String? |  |

### AcuseDocumento 🏢

| Campo | Tipo | Notas |
|---|---|---|
| id | String | PK, por defecto "cuid" |
| conjuntoId | String |  |
| documentoId | String |  |
| documento | Documento | relación |
| usuarioId | String |  |
| version | Int |  |
| leidoEn | DateTime | por defecto "now" |

Únicos compuestos: documentoId + usuarioId + version

### EventoCalendario 🏢

| Campo | Tipo | Notas |
|---|---|---|
| id | String | PK, por defecto "cuid" |
| conjuntoId | String |  |
| titulo | String |  |
| descripcion | String? |  |
| tipo | TipoEvento | enum, por defecto "COMUNITARIO" |
| inicio | DateTime |  |
| fin | DateTime |  |
| todoElDia | Boolean | por defecto false |
| lugar | String? |  |
| zonaId | String? |  |
| creadoPorId | String? |  |
| visibleResidentes | Boolean | por defecto true |

### ObjetoPerdido 🏢

| Campo | Tipo | Notas |
|---|---|---|
| id | String | PK, por defecto "cuid" |
| conjuntoId | String |  |
| tipo | TipoObjetoPerdido | enum |
| descripcion | String |  |
| lugar | String? |  |
| fecha | DateTime | por defecto "now" |
| fotoUrl | String? |  |
| reportadoPorId | String? |  |
| contacto | String? |  |
| estado | EstadoObjetoPerdido | enum, por defecto "ABIERTO" |
| entregadoA | String? |  |

## PQRS y convivencia

### Ticket 🏢

| Campo | Tipo | Notas |
|---|---|---|
| id | String | PK, por defecto "cuid" |
| conjuntoId | String |  |
| conjunto | Conjunto | relación |
| radicado | String |  |
| tipo | TipoTicket | enum |
| unidadId | String? |  |
| unidad | Unidad? | relación |
| solicitanteId | String? |  |
| solicitante | Usuario? | relación |
| solicitanteNombre | String? |  |
| solicitanteEmail | String? |  |
| solicitanteTelefono | String? |  |
| zonaId | String? |  |
| zona | ZonaComun? | relación |
| activoId | String? |  |
| activo | Activo? | relación |
| titulo | String |  |
| descripcion | String |  |
| adjuntos | String[] |  |
| ubicacion | String? |  |
| prioridad | PrioridadTicket | enum, por defecto "MEDIA" |
| estado | EstadoTicket | enum, por defecto "ABIERTO" |
| asignadoAId | String? |  |
| asignadoA | Usuario? | relación |
| proveedorId | String? |  |
| fechaLimite | DateTime |  |
| primeraRespuestaEn | DateTime? |  |
| resueltoEn | DateTime? |  |
| cerradoEn | DateTime? |  |
| calificacion | Int? |  |
| comentarioCalificacion | String? |  |
| reabiertoVeces | Int | por defecto 0 |
| origen | OrigenTicket | enum, por defecto "APP" |
| comentarios | ComentarioTicket[] | relación |

Únicos compuestos: conjuntoId + radicado

### ComentarioTicket 🏢

| Campo | Tipo | Notas |
|---|---|---|
| id | String | PK, por defecto "cuid" |
| conjuntoId | String |  |
| ticketId | String |  |
| ticket | Ticket | relación |
| autorId | String? |  |
| autor | Usuario? | relación |
| contenido | String |  |
| interno | Boolean | por defecto false |
| adjuntos | String[] |  |
| tipo | TipoComentarioTicket | enum, por defecto "COMENTARIO" |
| data | Json? |  |

### PlantillaRespuesta 🏢

| Campo | Tipo | Notas |
|---|---|---|
| id | String | PK, por defecto "cuid" |
| conjuntoId | String |  |
| titulo | String |  |
| contenido | String |  |
| tipoTicket | TipoTicket? | enum |

### LlamadoAtencion 🏢

| Campo | Tipo | Notas |
|---|---|---|
| id | String | PK, por defecto "cuid" |
| conjuntoId | String |  |
| unidadId | String |  |
| unidad | Unidad | relación |
| personaId | String? |  |
| persona | Persona? | relación |
| infraccionId | String? |  |
| motivo | String |  |
| descripcion | String |  |
| evidencias | String[] |  |
| gravedad | GravedadLlamado | enum, por defecto "LEVE" |
| enviadoPorId | String? |  |
| fecha | DateTime | por defecto "now" |
| acuseEn | DateTime? |  |
| respuesta | String? |  |
| respuestaEn | DateTime? |  |
| estado | EstadoLlamado | enum, por defecto "ENVIADO" |
| multaId | String? |  |

### IncidenteConvivencia 🏢

| Campo | Tipo | Notas |
|---|---|---|
| id | String | PK, por defecto "cuid" |
| conjuntoId | String |  |
| titulo | String |  |
| descripcion | String |  |
| unidadesIds | String[] |  |
| fecha | DateTime | por defecto "now" |
| estado | EstadoIncidente | enum, por defecto "ABIERTO" |
| mediadorId | String? |  |
| sesiones | Json | por defecto "[]" |
| acuerdos | String? |  |
| creadoPorId | String? |  |

### SolicitudObra 🏢

| Campo | Tipo | Notas |
|---|---|---|
| id | String | PK, por defecto "cuid" |
| conjuntoId | String |  |
| unidadId | String |  |
| unidad | Unidad | relación |
| solicitanteId | String? |  |
| descripcion | String |  |
| tipo | String | por defecto "REMODELACION" |
| fechaInicio | DateTime |  |
| fechaFin | DateTime |  |
| horario | String? | por defecto "L-V 8:00-17:00, S 8:00-13:00" |
| contratistas | Json | por defecto "[]" |
| deposito | Decimal | por defecto 0 |
| estado | EstadoSolicitud | enum, por defecto "SOLICITADA" |
| aprobadaPorId | String? |  |
| observaciones | String? |  |
| cierreNotas | String? |  |

### Mudanza 🏢

| Campo | Tipo | Notas |
|---|---|---|
| id | String | PK, por defecto "cuid" |
| conjuntoId | String |  |
| unidadId | String |  |
| unidad | Unidad | relación |
| solicitanteId | String? |  |
| tipo | TipoMudanza | enum |
| fecha | DateTime |  |
| horaInicio | String |  |
| horaFin | String |  |
| recurso | String? |  |
| empresa | String? |  |
| placaVehiculo | String? |  |
| enseres | Json | por defecto "[]" |
| pazYSalvoVerificado | Boolean | por defecto false |
| estado | EstadoSolicitud | enum, por defecto "SOLICITADA" |
| aprobadaPorId | String? |  |
| observaciones | String? |  |

## Gobierno

### Asamblea 🏢

| Campo | Tipo | Notas |
|---|---|---|
| id | String | PK, por defecto "cuid" |
| conjuntoId | String |  |
| conjunto | Conjunto | relación |
| titulo | String |  |
| tipo | TipoAsamblea | enum |
| modalidad | ModalidadAsamblea | enum, por defecto "PRESENCIAL" |
| fecha | DateTime |  |
| lugar | String? |  |
| enlace | String? |  |
| convocatoriaTexto | String? |  |
| convocatoriaEnviadaEn | DateTime? |  |
| ordenDelDia | Json | por defecto "[]" |
| quorumRequerido | Decimal | por defecto 50.000001 |
| limitePoderes | Int | por defecto 2 |
| estado | EstadoAsamblea | enum, por defecto "BORRADOR" |
| codigoAsistencia | String | único, por defecto "cuid" |
| actaTexto | String? |  |
| actaCodigo | String? | único |
| presidenteNombre | String? |  |
| secretarioNombre | String? |  |
| firmaPresidente | String? |  |
| firmaSecretario | String? |  |
| actaPublicadaEn | DateTime? |  |
| compromisos | Json | por defecto "[]" |
| iniciadaEn | DateTime? |  |
| finalizadaEn | DateTime? |  |
| asistencias | AsistenciaAsamblea[] | relación |
| poderes | PoderAsamblea[] | relación |
| votaciones | Votacion[] | relación |

### AsistenciaAsamblea 🏢

| Campo | Tipo | Notas |
|---|---|---|
| id | String | PK, por defecto "cuid" |
| conjuntoId | String |  |
| asambleaId | String |  |
| asamblea | Asamblea | relación |
| unidadId | String |  |
| unidad | Unidad | relación |
| personaNombre | String? |  |
| usuarioId | String? |  |
| tipo | TipoAsistencia | enum, por defecto "PRESENCIAL" |
| coeficiente | Decimal |  |
| poderId | String? |  |
| registradaEn | DateTime | por defecto "now" |
| salidaEn | DateTime? |  |

Únicos compuestos: asambleaId + unidadId

### PoderAsamblea 🏢

| Campo | Tipo | Notas |
|---|---|---|
| id | String | PK, por defecto "cuid" |
| conjuntoId | String |  |
| asambleaId | String |  |
| asamblea | Asamblea | relación |
| unidadId | String |  |
| otorganteNombre | String |  |
| apoderadoNombre | String |  |
| apoderadoDocumento | String? |  |
| apoderadoUsuarioId | String? |  |
| documentoUrl | String? |  |
| estado | EstadoPoder | enum, por defecto "PENDIENTE" |

Únicos compuestos: asambleaId + unidadId

### Votacion 🏢

| Campo | Tipo | Notas |
|---|---|---|
| id | String | PK, por defecto "cuid" |
| conjuntoId | String |  |
| conjunto | Conjunto | relación |
| asambleaId | String? |  |
| asamblea | Asamblea? | relación |
| puntoOrden | Int? |  |
| pregunta | String |  |
| descripcion | String? |  |
| opciones | Json |  |
| tipoMayoria | TipoMayoria | enum, por defecto "SIMPLE" |
| ponderacion | Ponderacion | enum, por defecto "COEFICIENTE" |
| quienVota | QuienVota | enum, por defecto "PROPIETARIOS" |
| secreto | Boolean | por defecto false |
| inicio | DateTime | por defecto "now" |
| fin | DateTime |  |
| estado | EstadoVotacion | enum, por defecto "ABIERTA" |
| resultado | Json? |  |
| codigoActa | String? | único |
| votos | Voto[] | relación |

### Voto 🏢

| Campo | Tipo | Notas |
|---|---|---|
| id | String | PK, por defecto "cuid" |
| conjuntoId | String |  |
| votacionId | String |  |
| votacion | Votacion | relación |
| unidadId | String |  |
| unidad | Unidad | relación |
| opcionId | String |  |
| usuarioId | String? |  |
| votanteNombre | String? |  |
| coeficiente | Decimal |  |
| porPoder | Boolean | por defecto false |
| comprobanteHash | String | único |
| emitidoEn | DateTime | por defecto "now" |

Únicos compuestos: votacionId + unidadId

### MiembroConsejo 🏢

| Campo | Tipo | Notas |
|---|---|---|
| id | String | PK, por defecto "cuid" |
| conjuntoId | String |  |
| personaId | String? |  |
| usuarioId | String? |  |
| nombre | String |  |
| unidadCodigo | String? |  |
| cargo | CargoConsejo | enum, por defecto "VOCAL" |
| periodoInicio | DateTime |  |
| periodoFin | DateTime |  |
| activo | Boolean | por defecto true |

### ReunionConsejo 🏢

| Campo | Tipo | Notas |
|---|---|---|
| id | String | PK, por defecto "cuid" |
| conjuntoId | String |  |
| fecha | DateTime |  |
| tema | String |  |
| asistentes | String[] |  |
| actaTexto | String? |  |
| decisiones | String? |  |

## Activos, mantenimiento y proveedores

### Activo 🏢

| Campo | Tipo | Notas |
|---|---|---|
| id | String | PK, por defecto "cuid" |
| conjuntoId | String |  |
| conjunto | Conjunto | relación |
| nombre | String |  |
| categoria | String |  |
| ubicacion | String? |  |
| zonaId | String? |  |
| zona | ZonaComun? | relación |
| marca | String? |  |
| modelo | String? |  |
| serie | String? |  |
| fechaCompra | DateTime? |  |
| valor | Decimal? |  |
| vidaUtilAnios | Int? |  |
| proveedorId | String? |  |
| proveedor | Proveedor? | relación |
| garantiaVence | DateTime? |  |
| fotos | String[] |  |
| manuales | String[] |  |
| codigoQr | String | único, por defecto "cuid" |
| estado | EstadoActivo | enum, por defecto "OPERATIVO" |
| notas | String? |  |
| planes | PlanMantenimiento[] | relación |
| ordenes | OrdenTrabajo[] | relación |
| tickets | Ticket[] | relación |

### PlanMantenimiento 🏢

| Campo | Tipo | Notas |
|---|---|---|
| id | String | PK, por defecto "cuid" |
| conjuntoId | String |  |
| activoId | String? |  |
| activo | Activo? | relación |
| zonaId | String? |  |
| nombre | String |  |
| tipo | TipoMantenimiento | enum, por defecto "PREVENTIVO" |
| frecuenciaDias | Int |  |
| proximaFecha | DateTime |  |
| ultimaEjecucion | DateTime? |  |
| responsableId | String? |  |
| proveedorId | String? |  |
| proveedor | Proveedor? | relación |
| checklist | String[] |  |
| costoEstimado | Decimal? |  |
| diasAnticipacion | Int | por defecto 7 |
| activoPlan | Boolean | por defecto true |
| ordenes | OrdenTrabajo[] | relación |

### OrdenTrabajo 🏢

| Campo | Tipo | Notas |
|---|---|---|
| id | String | PK, por defecto "cuid" |
| conjuntoId | String |  |
| numero | Int |  |
| origen | OrigenOrden | enum, por defecto "MANUAL" |
| planId | String? |  |
| plan | PlanMantenimiento? | relación |
| ticketId | String? |  |
| activoId | String? |  |
| activo | Activo? | relación |
| zonaId | String? |  |
| proveedorId | String? |  |
| proveedor | Proveedor? | relación |
| asignadoAId | String? |  |
| titulo | String |  |
| descripcion | String? |  |
| fechaProgramada | DateTime |  |
| fechaInicio | DateTime? |  |
| fechaCierre | DateTime? |  |
| costo | Decimal? |  |
| checklist | Json | por defecto "[]" |
| evidencias | String[] |  |
| estado | EstadoOrden | enum, por defecto "PENDIENTE" |
| notasCierre | String? |  |

Únicos compuestos: conjuntoId + numero

### Proveedor 🏢

| Campo | Tipo | Notas |
|---|---|---|
| id | String | PK, por defecto "cuid" |
| conjuntoId | String |  |
| conjunto | Conjunto | relación |
| nit | String |  |
| razonSocial | String |  |
| categoria | String |  |
| contactoNombre | String? |  |
| telefono | String? |  |
| email | String? |  |
| direccion | String? |  |
| tarifas | String? |  |
| directorioComunitario | Boolean | por defecto false |
| beneficioComunidad | String? |  |
| calificacionPromedio | Decimal | por defecto 0 |
| usuarioId | String? |  |
| activo | Boolean | por defecto true |
| documentos | DocumentoProveedor[] | relación |
| calificaciones | CalificacionProveedor[] | relación |
| contratos | Contrato[] | relación |
| activos | Activo[] | relación |
| planes | PlanMantenimiento[] | relación |
| ordenes | OrdenTrabajo[] | relación |

### DocumentoProveedor 🏢

| Campo | Tipo | Notas |
|---|---|---|
| id | String | PK, por defecto "cuid" |
| conjuntoId | String |  |
| proveedorId | String |  |
| proveedor | Proveedor | relación |
| tipo | TipoDocProveedor | enum |
| archivoUrl | String? |  |
| vence | DateTime? |  |

### CalificacionProveedor 🏢

| Campo | Tipo | Notas |
|---|---|---|
| id | String | PK, por defecto "cuid" |
| conjuntoId | String |  |
| proveedorId | String |  |
| proveedor | Proveedor | relación |
| usuarioId | String |  |
| usuarioNombre | String? |  |
| puntaje | Int |  |
| comentario | String? |  |

Únicos compuestos: proveedorId + usuarioId

### Contrato 🏢

| Campo | Tipo | Notas |
|---|---|---|
| id | String | PK, por defecto "cuid" |
| conjuntoId | String |  |
| proveedorId | String |  |
| proveedor | Proveedor | relación |
| objeto | String |  |
| valor | Decimal |  |
| inicio | DateTime |  |
| fin | DateTime |  |
| renovacionAutomatica | Boolean | por defecto false |
| diasAlerta | Int | por defecto 30 |
| documentoUrl | String? |  |
| estado | EstadoContrato | enum, por defecto "VIGENTE" |

### Presupuesto 🏢

| Campo | Tipo | Notas |
|---|---|---|
| id | String | PK, por defecto "cuid" |
| conjuntoId | String |  |
| anio | Int |  |
| estado | EstadoPresupuesto | enum, por defecto "BORRADOR" |
| asambleaId | String? |  |
| notas | String? |  |
| rubros | RubroPresupuesto[] | relación |

Únicos compuestos: conjuntoId + anio

### RubroPresupuesto 🏢

| Campo | Tipo | Notas |
|---|---|---|
| id | String | PK, por defecto "cuid" |
| conjuntoId | String |  |
| presupuestoId | String |  |
| presupuesto | Presupuesto | relación |
| tipo | TipoRubro | enum |
| nombre | String |  |
| cuentaContable | String? |  |
| valorAnual | Decimal |  |
| gastos | Gasto[] | relación |

### Gasto 🏢

| Campo | Tipo | Notas |
|---|---|---|
| id | String | PK, por defecto "cuid" |
| conjuntoId | String |  |
| rubroId | String? |  |
| rubro | RubroPresupuesto? | relación |
| proveedorId | String? |  |
| ordenTrabajoId | String? |  |
| fecha | DateTime |  |
| descripcion | String |  |
| valor | Decimal |  |
| comprobanteUrl | String? |  |
| estado | EstadoGasto | enum, por defecto "PENDIENTE_APROBACION" |
| aprobadoPorId | String? |  |
| cuentaContable | String? |  |

### Empleado 🏢

| Campo | Tipo | Notas |
|---|---|---|
| id | String | PK, por defecto "cuid" |
| conjuntoId | String |  |
| nombre | String |  |
| documento | String? |  |
| cargo | String |  |
| turno | String? |  |
| telefono | String? |  |
| fotoUrl | String? |  |
| epsVence | DateTime? |  |
| arlVence | DateTime? |  |
| fechaIngreso | DateTime? |  |
| documentos | String[] |  |
| activo | Boolean | por defecto true |

## Emergencias

### PlanEmergencia 🏢

| Campo | Tipo | Notas |
|---|---|---|
| id | String | PK, por defecto "cuid" |
| conjuntoId | String | único |
| puntosEncuentro | Json | por defecto "[]" |
| instrucciones | String? |  |
| telefonosEmergencia | Json | por defecto "[]" |

### Brigadista 🏢

| Campo | Tipo | Notas |
|---|---|---|
| id | String | PK, por defecto "cuid" |
| conjuntoId | String |  |
| personaId | String? |  |
| nombre | String |  |
| rol | RolBrigadista | enum |
| torreNombre | String? |  |
| telefono | String? |  |

### Simulacro 🏢

| Campo | Tipo | Notas |
|---|---|---|
| id | String | PK, por defecto "cuid" |
| conjuntoId | String |  |
| fecha | DateTime |  |
| tipo | String |  |
| participantes | Int | por defecto 0 |
| tiempoEvacuacionMin | Int? |  |
| observaciones | String? |  |

## Transversales

### Auditoria

| Campo | Tipo | Notas |
|---|---|---|
| id | String | PK, por defecto "cuid" |
| conjuntoId | String? |  |
| conjunto | Conjunto? | relación |
| usuarioId | String? |  |
| usuarioNombre | String? |  |
| impersonadoPorId | String? |  |
| accion | String |  |
| entidad | String |  |
| entidadId | String? |  |
| antes | Json? |  |
| despues | Json? |  |
| ip | String? |  |
| userAgent | String? |  |

### Adjunto 🏢

| Campo | Tipo | Notas |
|---|---|---|
| id | String | PK, por defecto "cuid" |
| conjuntoId | String |  |
| entidad | String |  |
| entidadId | String |  |
| url | String |  |
| nombre | String |  |
| mime | String |  |
| tamano | Int |  |
| subidoPorId | String? |  |

### ImportacionApertura 🏢

| Campo | Tipo | Notas |
|---|---|---|
| id | String | PK, por defecto "cuid" |
| conjuntoId | String |  |
| tipo | String |  |
| archivoNombre | String |  |
| estado | EstadoImportacion | enum, por defecto "VALIDANDO" |
| totalFilas | Int | por defecto 0 |
| filasOk | Int | por defecto 0 |
| filasError | Int | por defecto 0 |
| errores | Json | por defecto "[]" |
| resumen | Json? |  |
| creadoPorId | String? |  |

### ConfiguracionIntegracion

| Campo | Tipo | Notas |
|---|---|---|
| id | String | PK, por defecto "cuid" |
| conjuntoId | String? |  |
| tipo | TipoIntegracion | enum |
| datosCifrados | String |  |
| activo | Boolean | por defecto true |
| ultimaPrueba | DateTime? |  |
| ultimoResultado | String? |  |

Únicos compuestos: conjuntoId + tipo

### Backup 🏢

| Campo | Tipo | Notas |
|---|---|---|
| id | String | PK, por defecto "cuid" |
| conjuntoId | String |  |
| archivoUrl | String |  |
| tamano | Int |  |
| registros | Int |  |

### ConsultaIA 🏢

| Campo | Tipo | Notas |
|---|---|---|
| id | String | PK, por defecto "cuid" |
| conjuntoId | String |  |
| usuarioId | String |  |
| tipo | String |  |
| pregunta | String |  |
| respuesta | String |  |
| tokens | Int | por defecto 0 |

## Enums

- **TipoConjunto**: EDIFICIO, CONJUNTO_CASAS, MIXTO
- **EstadoConjunto**: ACTIVO, SUSPENDIDO, EN_APERTURA, INACTIVO
- **TipoUnidad**: APARTAMENTO, CASA, LOCAL, OFICINA, DEPOSITO, PARQUEADERO
- **EstadoOcupacion**: PROPIETARIO_OCUPA, ARRENDADA, AIRBNB_O_SIMILAR, DESOCUPADA, EN_VENTA
- **TipoParqueadero**: PRIVADO, COMUN, VISITANTES, MOTO, BICICLETA, DISCAPACIDAD
- **EstadoEspacio**: DISPONIBLE, ASIGNADO, OCUPADO, FUERA_SERVICIO
- **CategoriaZona**: SALON, PISCINA, GIMNASIO, BBQ, CANCHA, JUEGOS, TERRAZA, SALA_JUNTAS, COWORKING, OTRA
- **EstadoZona**: ACTIVA, MANTENIMIENTO, INACTIVA
- **EstadoUsuario**: ACTIVO, INVITADO, BLOQUEADO, INACTIVO
- **EstadoMembresia**: ACTIVA, PENDIENTE, SUSPENDIDA
- **TipoDocumento**: CC, CE, TI, RC, PA, NIT, PEP, PPT
- **TipoVinculo**: PROPIETARIO, COPROPIETARIO, ARRENDATARIO, RESIDENTE, FAMILIAR, EMPLEADO_DOMESTICO, CUIDADOR, VISITANTE_FRECUENTE, AUTORIZADO_RECOGER_PAQUETES, AUTORIZADO_MENORES
- **EstadoVinculo**: PENDIENTE_APROBACION, ACTIVO, INACTIVO, RECHAZADO
- **TipoVehiculo**: CARRO, MOTO, BICICLETA, OTRO
- **TipoConcepto**: ADMINISTRACION, EXTRAORDINARIA, MULTA, INTERES_MORA, ALQUILER_ZONA, PARQUEADERO, SERVICIO, OTRO
- **EstadoCuota**: PENDIENTE, PARCIAL, PAGADA, ANULADA, EN_ACUERDO
- **OrigenCuota**: GENERACION_MENSUAL, MANUAL, RESERVA, MULTA, ASAMBLEA, APERTURA, INTERES
- **DistribucionCuota**: POR_COEFICIENTE, IGUAL_POR_UNIDAD, MANUAL
- **EstadoMulta**: PROPUESTA, NOTIFICADA, EN_DESCARGOS, RATIFICADA, REVOCADA, PAGADA
- **MedioPago**: PSE, TARJETA, NEQUI, BANCOLOMBIA_QR, EFECTIVO, TRANSFERENCIA, CONSIGNACION, PASARELA
- **Pasarela**: WOMPI, MERCADOPAGO, SIMULADOR, NINGUNA
- **EstadoPago**: PENDIENTE, APROBADO, RECHAZADO, ANULADO
- **EstadoAcuerdo**: VIGENTE, CUMPLIDO, INCUMPLIDO, ANULADO
- **TipoMovimiento**: DEBITO, CREDITO
- **EstadoCertificado**: VIGENTE, VENCIDO, ANULADO
- **EstadoLineaExtracto**: PENDIENTE, EMPAREJADA, CREADA, IGNORADA
- **CanalCobro**: LLAMADA, CORREO, VISITA, WHATSAPP, CARTA, SMS
- **EstadoReserva**: SOLICITADA, APROBADA, RECHAZADA, CANCELADA, CUMPLIDA, NO_SHOW
- **EstadoFactura**: PENDIENTE, EN_PROCESO, VALIDADA, ERROR, ANULADA
- **TipoDocumentoElectronico**: FACTURA, NOTA_CREDITO
- **TipoVisitante**: VISITA, DOMICILIO, PROVEEDOR, TECNICO, TRANSPORTE, CONTRATISTA, OTRO
- **EstadoAutorizacion**: ACTIVA, USADA, VENCIDA, REVOCADA
- **EstadoSolicitudIngreso**: PENDIENTE, AUTORIZADA, RECHAZADA, EXPIRADA, DECISION_TELEFONICA
- **TipoRegistroAcceso**: INGRESO, SALIDA, ANULACION
- **SujetoAcceso**: VISITANTE, RESIDENTE, EMPLEADO, VEHICULO, PROVEEDOR, DOMICILIARIO
- **MedioAcceso**: QR, CODIGO, LLAMADA_RESIDENTE, LISTA_FRECUENTES, MANUAL
- **EstadoTurno**: ABIERTO, CERRADO
- **TipoNovedad**: RUIDO, DANO, EMERGENCIA, INCIDENTE, SEGURIDAD, SERVICIOS, OTRO
- **Severidad**: BAJA, MEDIA, ALTA, CRITICA
- **TipoPaquete**: SOBRE, CAJA, MERCADO, DOMICILIO, OTRO
- **EstadoPaquete**: EN_PORTERIA, ENTREGADO, DEVUELTO
- **TipoElemento**: LLAVE, CONTROL, TARJETA, RADIO, OTRO
- **EstadoElemento**: DISPONIBLE, PRESTADO, PERDIDO
- **TipoAlerta**: PANICO, EMERGENCIA_GENERAL, INCENDIO, SISMO, MEDICA, SEGURIDAD
- **EstadoAlerta**: ACTIVA, ATENDIDA, FALSA_ALARMA
- **CategoriaPublicacion**: AVISO, NOTICIA, EVENTO, EMERGENCIA, CLASIFICADO, PERDIDO_ENCONTRADO
- **EstadoPublicacion**: BORRADOR, PENDIENTE_MODERACION, PUBLICADA, RECHAZADA, ARCHIVADA
- **TipoCampana**: GENERAL, COBRO_ADMINISTRACION
- **EstadoCampana**: BORRADOR, PROGRAMADA, ENVIANDO, ENVIADA, CANCELADA
- **EstadoCorreo**: PENDIENTE, ENVIADO, ERROR, CANCELADO
- **TipoPregunta**: UNICA, MULTIPLE, ESCALA, TEXTO
- **EstadoEncuesta**: BORRADOR, ABIERTA, CERRADA
- **CategoriaDocumento**: REGLAMENTO, MANUAL_CONVIVENCIA, ACTA, PRESUPUESTO, ESTADO_FINANCIERO, POLIZA, CONTRATO, CIRCULAR, OTRO
- **TipoEvento**: COMUNITARIO, ASAMBLEA, MANTENIMIENTO, FUMIGACION, CORTE_SERVICIO, OTRO
- **TipoObjetoPerdido**: PERDIDO, ENCONTRADO
- **EstadoObjetoPerdido**: ABIERTO, DEVUELTO, CERRADO
- **TipoTicket**: PETICION, QUEJA, RECLAMO, SUGERENCIA, FELICITACION, DANO_ZONA_COMUN, DANO_UNIDAD, SEGURIDAD, RUIDO, MASCOTAS, OTRO
- **PrioridadTicket**: BAJA, MEDIA, ALTA, URGENTE
- **EstadoTicket**: ABIERTO, EN_REVISION, ASIGNADO, EN_PROCESO, EN_ESPERA_RESIDENTE, RESUELTO, CERRADO, REABIERTO
- **OrigenTicket**: APP, PORTERIA, PUBLICO, NOVEDAD, ACTIVO_QR
- **TipoComentarioTicket**: COMENTARIO, CAMBIO_ESTADO, ASIGNACION, SISTEMA
- **GravedadLlamado**: LEVE, MODERADA, GRAVE
- **EstadoLlamado**: ENVIADO, LEIDO, RESPONDIDO, CERRADO, ESCALADO_MULTA
- **EstadoIncidente**: ABIERTO, EN_MEDIACION, ACUERDO, CERRADO, ESCALADO
- **EstadoSolicitud**: SOLICITADA, APROBADA, RECHAZADA, EN_CURSO, FINALIZADA, CANCELADA
- **TipoMudanza**: INGRESO, SALIDA
- **TipoAsamblea**: ORDINARIA, EXTRAORDINARIA
- **ModalidadAsamblea**: PRESENCIAL, VIRTUAL, MIXTA
- **EstadoAsamblea**: BORRADOR, CONVOCADA, EN_CURSO, FINALIZADA, CANCELADA
- **TipoAsistencia**: PRESENCIAL, VIRTUAL, PODER
- **EstadoPoder**: PENDIENTE, APROBADO, RECHAZADO
- **TipoMayoria**: SIMPLE, CALIFICADA_70, UNANIME
- **Ponderacion**: COEFICIENTE, UNIDAD
- **QuienVota**: PROPIETARIOS_AL_DIA, PROPIETARIOS, TODOS
- **EstadoVotacion**: BORRADOR, ABIERTA, CERRADA, ANULADA
- **CargoConsejo**: PRESIDENTE, SECRETARIO, VOCAL, SUPLENTE
- **EstadoActivo**: OPERATIVO, EN_MANTENIMIENTO, FUERA_SERVICIO, DADO_DE_BAJA
- **TipoMantenimiento**: PREVENTIVO, CORRECTIVO, LEGAL
- **OrigenOrden**: PLAN, TICKET, MANUAL
- **EstadoOrden**: PENDIENTE, PROGRAMADA, EN_PROCESO, COMPLETADA, CANCELADA
- **TipoDocProveedor**: RUT, CAMARA_COMERCIO, POLIZA, SEGURIDAD_SOCIAL, CERTIFICACION, OTRO
- **EstadoContrato**: VIGENTE, POR_VENCER, VENCIDO, TERMINADO
- **EstadoPresupuesto**: BORRADOR, APROBADO, CERRADO
- **TipoRubro**: INGRESO, GASTO
- **EstadoGasto**: PENDIENTE_APROBACION, APROBADO, RECHAZADO, PAGADO
- **TipoToken**: MAGIC_LINK, RESET_PASSWORD, OTP, PAGO_PUBLICO
- **EstadoInvitacion**: PENDIENTE, ACEPTADA, VENCIDA, REVOCADA
- **TipoIntegracion**: WOMPI, MERCADOPAGO, FACTUS, ALANUBE, SMTP, WHATSAPP
- **EstadoImportacion**: VALIDANDO, CON_ERRORES, APLICADA, FALLIDA
- **EstadoSuscripcion**: ACTIVA, PRUEBA, VENCIDA, CANCELADA
- **RolBrigadista**: COORDINADOR, PRIMEROS_AUXILIOS, EVACUACION, CONTRA_INCENDIO
