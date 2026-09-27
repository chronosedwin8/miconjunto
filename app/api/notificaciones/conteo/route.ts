import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/context";

export async function GET() {
  const su = await getSessionUser();
  if (!su) return NextResponse.json({ count: 0 }, { status: 401 });
  const count = await prisma.notificacion.count({ where: { usuarioId: su.userId, leida: false, deletedAt: null } });
  return NextResponse.json({ count });
}
