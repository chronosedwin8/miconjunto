import { hash, verify } from "@node-rs/argon2";

const OPTS = { memoryCost: 19456, timeCost: 2, parallelism: 1 };

export function hashPassword(plain: string) {
  return hash(plain, OPTS);
}

export async function verifyPassword(hashed: string | null | undefined, plain: string) {
  if (!hashed) return false;
  try {
    return await verify(hashed, plain);
  } catch {
    return false;
  }
}

/** Reglas mínimas: 8+ caracteres, una mayúscula, una minúscula y un número. */
export function passwordIssues(p: string): string | null {
  if (p.length < 8) return "La contraseña debe tener al menos 8 caracteres.";
  if (!/[A-Z]/.test(p) || !/[a-z]/.test(p) || !/\d/.test(p))
    return "La contraseña debe incluir mayúsculas, minúsculas y números.";
  return null;
}
