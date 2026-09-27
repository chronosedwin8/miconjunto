import "dotenv/config";

// Las pruebas de integración usan la BD de pruebas (miconjunto_test) para no tocar la de desarrollo.
if (process.env.DATABASE_URL_TEST) process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
process.env.TZ = "America/Bogota";
process.env.APP_ENCRYPTION_KEY ??= "test-key-0123456789abcdef0123456789abcdef";
