import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();

/** PRNG determinista (mulberry32) para que el seed sea reproducible. */
export function makeRng(seed = 20260927) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min: number, max: number) => Math.floor(next() * (max - min + 1)) + min,
    pick: <T>(arr: readonly T[]) => arr[Math.floor(next() * arr.length)],
    chance: (p: number) => next() < p,
    shuffle: <T>(arr: T[]) => {
      const a2 = [...arr];
      for (let i = a2.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [a2[i], a2[j]] = [a2[j], a2[i]];
      }
      return a2;
    },
  };
}
export type Rng = ReturnType<typeof makeRng>;

export const NOMBRES_M = ["Carlos", "Andrés", "Juan", "Luis", "Jorge", "Camilo", "Santiago", "Felipe", "Alejandro", "Diego", "Mauricio", "Ricardo", "Hernán", "Óscar", "Julián", "Sebastián", "Daniel", "Fernando", "Esteban", "Rafael"];
export const NOMBRES_F = ["María", "Ana", "Laura", "Carolina", "Paola", "Diana", "Natalia", "Juliana", "Valentina", "Daniela", "Luisa", "Catalina", "Andrea", "Marcela", "Sandra", "Gloria", "Patricia", "Isabel", "Mónica", "Adriana"];
export const APELLIDOS = ["Rodríguez", "Gómez", "González", "Martínez", "García", "López", "Hernández", "Sánchez", "Ramírez", "Pérez", "Díaz", "Torres", "Vargas", "Moreno", "Rojas", "Jiménez", "Castro", "Ortiz", "Rubio", "Mendoza", "Pardo", "Barrios", "Charris", "De la Hoz", "Barraza", "Orozco", "Polo", "Fontalvo"];
export const EPS = ["Sura", "Sanitas", "Nueva EPS", "Salud Total", "Coosalud", "Compensar", "Famisanar"];

export function persona(rng: Rng, genero?: "M" | "F") {
  const g = genero ?? (rng.chance(0.5) ? "M" : "F");
  return {
    genero: g === "M" ? "Masculino" : "Femenino",
    nombres: g === "M" ? rng.pick(NOMBRES_M) : rng.pick(NOMBRES_F),
    apellidos: `${rng.pick(APELLIDOS)} ${rng.pick(APELLIDOS)}`,
  };
}

export function fechaNacimiento(rng: Rng, edadMin: number, edadMax: number) {
  const edad = rng.int(edadMin, edadMax);
  const d = new Date();
  d.setFullYear(d.getFullYear() - edad);
  d.setMonth(rng.int(0, 11));
  d.setDate(rng.int(1, 28));
  return d;
}

export function telefono(rng: Rng) {
  return `3${rng.pick(["00", "01", "04", "10", "12", "15", "20", "22", "50"])}${rng.int(1000000, 9999999)}`;
}

export function placaCarro(rng: Rng) {
  const L = "ABCDEFGHIJKLMNOPRSTUVWXYZ";
  return `${L[rng.int(0, 24)]}${L[rng.int(0, 24)]}${L[rng.int(0, 24)]}${rng.int(100, 999)}`;
}

export function placaMoto(rng: Rng) {
  const L = "ABCDEFGHIJKLMNOPRSTUVWXYZ";
  return `${L[rng.int(0, 24)]}${L[rng.int(0, 24)]}${L[rng.int(0, 24)]}${rng.int(10, 99)}${L[rng.int(0, 24)]}`;
}

export type SeedState = {
  conjuntoId: string;
  users: Record<string, string>;
  roles: Record<string, string>;
  rng: Rng;
  now: Date;
};

export function monthsAgo(now: Date, n: number, day = 1) {
  const d = new Date(now);
  d.setMonth(d.getMonth() - n, day);
  d.setHours(12, 0, 0, 0);
  return d;
}

export function daysAgo(now: Date, n: number, hour = 12) {
  const d = new Date(now.getTime() - n * 86400000);
  d.setHours(hour, 0, 0, 0);
  return d;
}
