import { NextResponse } from "next/server";
import { listPendingApprovalMissionSubmissions } from "@/lib/missions";

// 미션 승인 대기 큐(/missions/approvals, task.md 3-5).
export async function GET() {
  const submissions = await listPendingApprovalMissionSubmissions();
  return NextResponse.json(
    submissions.map((s) => ({
      id: s.id,
      status: s.status,
      submittedAt: s.submittedAt,
      submittedPhotoPath: s.submittedPhotoPath,
      submittedText: s.submittedText,
      patientId: s.patientId,
      patientName: s.patient.name,
      chartNumber: s.patient.chartNumber,
      missionTitle: s.missionTemplate.title,
      missionCategory: s.missionTemplate.category,
      rewardAmount: s.missionTemplate.rewardAmount,
    })),
  );
}
