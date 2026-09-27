import { NextResponse } from "next/server";
import { getCtx } from "@/lib/auth/context";
import { globalSearch } from "@/lib/buscar/service";

export async function GET(req: Request) {
  const ctx = await getCtx();
  if (!ctx) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const q = new URL(req.url).searchParams.get("q") ?? "";
  return NextResponse.json({ resultados: await globalSearch(ctx, q) });
}
