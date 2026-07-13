import { NextResponse } from "next/server";
import { listPatientTeachingPages } from "@/lib/teaching-pages";

// 공유링크 패널(14-11)의 "기존 저장된 티칭지" 드롭다운용.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rows = await listPatientTeachingPages(Number(id));
  return NextResponse.json(rows);
}
