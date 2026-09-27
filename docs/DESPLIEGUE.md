# Guía de despliegue

## Opción A — Docker Compose (recomendada para empezar)

```bash
cp .env.example .env            # completa secretos (ver abajo)
docker compose up -d --build    # levanta PostgreSQL 16 + app (web + worker)
docker compose exec app npm run seed   # (opcional) datos de demostración
```

La app queda en `http://<servidor>:3000`. El contenedor aplica las migraciones (`prisma migrate deploy`) al arrancar y ejecuta `npm run start`, que corre **la web y el worker de jobs** (pg-boss) juntos.

## Opción B — EC2 / VPS con Nginx + PM2

1. Ubuntu 24.04, Node.js 22 (`nvm install 22`), PostgreSQL 16 (`apt install postgresql-16`), Nginx y Certbot.
2. Crea la base: `sudo -u postgres psql -c "CREATE DATABASE miconjunto;"` y un usuario con clave segura.
3. Clona el repositorio, `npm ci`, crea `.env` a partir de `.env.example`.
4. `npx prisma migrate deploy && npm run build`.
5. PM2 (dos procesos):
   ```bash
   npm i -g pm2
   pm2 start "npm run start:web" --name miconjunto-web
   pm2 start "npm run worker" --name miconjunto-jobs
   pm2 save && pm2 startup
   ```
6. Nginx como proxy inverso con HTTPS (Certbot). Importante para SSE (tiempo real) desactivar el buffering:
   ```nginx
   server {
     server_name app.miconjunto.co;
     client_max_body_size 15m;
     location /api/events {
       proxy_pass http://127.0.0.1:3000;
       proxy_http_version 1.1;
       proxy_set_header Connection "";
       proxy_buffering off;
       proxy_read_timeout 1h;
     }
     location / {
       proxy_pass http://127.0.0.1:3000;
       proxy_set_header Host $host;
       proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
       proxy_set_header X-Forwarded-Proto $scheme;
     }
   }
   ```
7. `sudo certbot --nginx -d app.miconjunto.co`.

## Variables de entorno de producción

| Variable | Obligatoria | Nota |
|---|---|---|
| `DATABASE_URL` | Sí | PostgreSQL 16+ |
| `NEXTAUTH_URL`, `APP_URL` | Sí | URL pública con https |
| `NEXTAUTH_SECRET` / `AUTH_SECRET` | Sí | `openssl rand -base64 32` |
| `APP_ENCRYPTION_KEY` | Sí | `openssl rand -hex 32` — cifra credenciales de integraciones; **no la cambies** después (no se podrían descifrar) |
| `SMTP_*` | Recomendada | Sin SMTP los correos quedan en el buzón de desarrollo |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Recomendada | `npx web-push generate-vapid-keys` (notificaciones push) |
| `STORAGE_DRIVER=s3` + `S3_*` | Recomendada | S3 / Cloudflare R2 / MinIO para archivos |
| `WOMPI_*`, `MP_*` | Para pagos reales | También se pueden configurar por conjunto en la app |
| `FACTUS_*` / `ALANUBE_*` | Para facturación real | También por conjunto |
| `WHATSAPP_*` | Opcional | Proveedor `meta`, `360dialog` o `twilio` |
| `ANTHROPIC_API_KEY` | Opcional | Activa el asistente con IA |
| `PAYMENTS_SIMULATOR` | — | Pon `false` en producción |

## Checklist de salida a producción

- [ ] HTTPS activo (HSTS ya se envía en las cabeceras).
- [ ] `PAYMENTS_SIMULATOR=false` y credenciales de Wompi en modo producción; URL de eventos configurada en el panel de Wompi: `https://<dominio>/api/webhooks/wompi`.
- [ ] Mercado Pago: URL de notificaciones `https://<dominio>/api/webhooks/mercadopago`.
- [ ] Factus en producción (`FACTUS_BASE_URL=https://api.factus.com.co`) y rango de numeración configurado.
- [ ] SMTP con SPF/DKIM del dominio remitente.
- [ ] Backups: el job diario guarda un respaldo lógico por conjunto (retención `BACKUP_RETENTION_DAYS`, 14 por defecto); además programa `pg_dump` diario de toda la base fuera del servidor.
- [ ] Monitoreo: panel SuperAdmin → *Jobs e integraciones*.
- [ ] Rotar las contraseñas de los usuarios demo o no ejecutar el seed en producción.
