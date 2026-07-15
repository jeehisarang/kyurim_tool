import { NextResponse } from "next/server";
import { getHrvTestRecord } from "@/lib/hrv";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const record = await getHrvTestRecord(Number(id));
  if (!record) return NextResponse.json({ error: "검사기록을 찾을 수 없습니다." }, { status: 404 });
  return NextResponse.json(record);
}
