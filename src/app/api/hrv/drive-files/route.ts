import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { listHrvDriveFiles, HrvDriveFolderNotConfiguredError } from "@/lib/google-drive";
import { guessPatientFromFilename } from "@/lib/hrv-patient-match";

/**
 * HRV 결과지 구글드라이브 폴더 파일 목록(task2.md) — 폴더 공유/GOOGLE_HRV_DRIVE_FOLDER_ID
 * 설정 전에는 503으로 명확히 안내한다(모달이 빈 상태 대신 안내 문구를 보여줄 수 있게).
 * 각 파일마다 파일명 기반 환자 매칭 추정값을 함께 내려준다 — 직원이 재검색/변경 가능.
 */
export async function GET() {
  let files;
  try {
    files = await listHrvDriveFiles();
  } catch (err) {
    if (err instanceof HrvDriveFolderNotConfiguredError) {
      return NextResponse.json({ error: err.message, configured: false }, { status: 503 });
    }
    const message = err instanceof Error ? err.message : "구글드라이브 폴더 조회에 실패했습니다.";
    return NextResponse.json({ error: message, configured: true }, { status: 502 });
  }

  const patients = await prisma.patient.findMany({ select: { id: true, name: true, chartNumber: true } });

  return NextResponse.json(
    files.map((f) => ({ ...f, matchedPatient: guessPatientFromFilename(f.name, patients) })),
  );
}
