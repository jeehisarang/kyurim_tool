import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * 카톡연결(채널 대화창 형성) 상태 토글(task.md) — 내원체크 목록의 배지 클릭 시 호출.
 * 미연결→연결, 연결→미연결 둘 다 허용한다(직원이 되돌리는 것도 일단 허용, task.md 지시).
 * 처리한 사람/시각을 매번 갱신해서 "누가 마지막으로 이 상태를 바꿨는지" 기록으로 남긴다.
 * 자동 리셋(POST /api/visits, 초진/재초진 신규 체크 시)과는 별개 경로.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const patientId = Number(id);
  const body = await request.json().catch(() => ({}));
  const staffUserId = Number(body.staffUserId);
  if (!staffUserId) {
    return NextResponse.json({ error: "처리한 직원 정보가 필요합니다." }, { status: 400 });
  }

  const existing = await prisma.patient.findUnique({ where: { id: patientId } });
  if (!existing) {
    return NextResponse.json({ error: "환자를 찾을 수 없습니다." }, { status: 404 });
  }

  const patient = await prisma.patient.update({
    where: { id: patientId },
    data: {
      kakaoChannelConnected: !existing.kakaoChannelConnected,
      kakaoChannelConnectedByStaffId: staffUserId,
      kakaoChannelConnectedAt: new Date(),
    },
    include: { kakaoChannelConnectedByStaff: true },
  });

  return NextResponse.json(patient);
}
