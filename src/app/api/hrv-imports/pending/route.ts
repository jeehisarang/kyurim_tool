import { NextResponse } from "next/server";
import { scanHrvCsvImports, listHrvImportPending } from "@/lib/hrv-csv-import";

/**
 * 미매칭 검사기록 대기열(task.md, 유비오맥파 CSV 자동연동) — 조회 시점마다 먼저 스캔해
 * 최신 상태로 만든다(/api/hrv-records GET과 동일한 자가치유 패턴).
 */
export async function GET() {
  try {
    await scanHrvCsvImports();
  } catch (err) {
    console.error("[hrv-csv-import] 스캔 실패:", err);
  }
  const rows = await listHrvImportPending();
  return NextResponse.json(rows);
}
