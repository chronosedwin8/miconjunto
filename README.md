# MiConjunto

SaaS multi-tenant para la administración de propiedad horizontal en Colombia: cartera y recaudo, pagos en línea, reservas, portería, paquetería, PQRS, comunicaciones, asambleas y votaciones, mantenimiento y estadísticas. PWA móvil primero.

> Documentación completa en [`docs/`](docs). Este README se amplía al final del proyecto.

## Requisitos

- Node.js 20+ (probado con 24)
- PostgreSQL 16+ local (`postgres` / `1004`)

## Instalación

```bash
npm install
cp .env.example .env        # completa NEXTAUTH_SECRET y APP_ENCRYPTION_KEY
npx prisma migrate deploy   # crea las tablas en la BD "miconjunto"
npm run seed                # datos de demostración
npm run dev                 # web (http://localhost:3000) + worker de jobs
```

## Credenciales demo

| Rol | Correo | Clave |
|---|---|---|
| SuperAdmin | admin@miconjunto.co | Admin1234* |
| Administrador | administrador@demo.co | Demo1234* |
| Portería | porteria@demo.co | Demo1234* |
| Consejo | consejo@demo.co | Demo1234* |
| Propietario | propietario@demo.co | Demo1234* |
| Residente | residente@demo.co | Demo1234* |
| Mantenimiento | mantenimiento@demo.co | Demo1234* |
| Familiar con acceso derivado (T1-101, todo el hogar) | familiar@demo.co | Demo1234* |
| Empleada con acceso derivado (T1-101, visitantes y paquetes) | empleada@demo.co | Demo1234* |
