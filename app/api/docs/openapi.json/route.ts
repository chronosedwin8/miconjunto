import { NextResponse } from "next/server";
import { openApiSpec } from "@/lib/api/openapi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(openApiSpec());
}
