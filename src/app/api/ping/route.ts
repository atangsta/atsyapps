import { NextResponse } from "next/server";

// force Node runtime + disable static opt
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ ok: true, method: "GET" });
}

export async function POST(req: Request) {
  const body = await req.text().catch(() => "");
  return NextResponse.json({ ok: true, method: "POST", body });
}

export async function OPTIONS() {
  // helps avoid preflight 405s
  return NextResponse.json({}, { status: 200 });
}

