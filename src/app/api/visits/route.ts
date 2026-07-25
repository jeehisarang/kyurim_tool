import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// 카톡연결 상태 리셋 대상 진료구분(task.md) — VisitTypeTag.tsx의 isInitialVisit과 동일한
// 이름 기반 판별(별도 enum/플래그 없이 VisitType.name 문자열로 구분하는 기존 관례).
const INITIAL_VISIT_TYPE_NAMES = ["초진", "재초진"];

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function parseDateParam(value: string | null): Date {
  const match = value ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value) : null;
  if (!match) return startOfToday();
  const [, y, m, d] = match;
  return new Date(Number(y), Number(m) - 1, Number(d));
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const targetDate = parseDateParam(searchParams.get("date"));

  const visits = await prisma.visit.findMany({
    where: { visitDate: targetDate, isActive: true },
    include: { patient: true, treatmentCategory: true, visitType: true, checkedByUser: true },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(visits);
}

export async function POST(request: Request) {
  const body = await request.json();
  const { patientId, treatmentCategoryId, visitTypeId, isReserved, checkedByUserId, visitDate } = body;

  if (!patientId || !treatmentCategoryId || !visitTypeId) {
    return NextResponse.json(
      { error: "필수 항목이 누락되었습니다." },
      { status: 400 },
    );
  }

  // visitDate는 화면에서 선택된 날짜("오늘"이 아닐 수 있음)를 그대로 받되, 자정 기준으로
  // 정규화해서 저장한다 — 시간이 섞이면 날짜별 조회(GET, 통계)가 매칭에 실패한다.
  const normalizedVisitDate =
    typeof visitDate === "string" ? parseDateParam(visitDate) : startOfToday();

  // 예약여부는 접수 시점이 아니라 진료 종료 후 목록에서 별도로 체크하는 값이라, 접수 시점엔
  // 항상 예약안함(false)으로 저장한다 — 값이 안 넘어와도 기본값 false를 보장.
  const visit = await prisma.visit.create({
    data: {
      patientId: Number(patientId),
      treatmentCategoryId: Number(treatmentCategoryId),
      visitTypeId: Number(visitTypeId),
      isReserved: isReserved === true,
      visitDate: normalizedVisitDate,
      checkedByUserId: typeof checkedByUserId === "number" ? checkedByUserId : null,
    },
    include: { patient: true, treatmentCategory: true, visitType: true, checkedByUser: true },
  });

  // 카톡연결(채널 대화창 형성) 상태 리셋(task.md) — "신규 체크 등록"(이 POST 경로)에서만
  // 발동. 초진/재초진이면 무조건 false로 리셋(연결 정보도 함께 지움), 재진이면 건드리지
  // 않는다. PATCH /api/visits/[id](수정)에는 이 로직이 없다 — 진료구분을 사후 정정해도
  // 리셋이 재발동되지 않도록 의도적으로 분리했다.
  if (INITIAL_VISIT_TYPE_NAMES.includes(visit.visitType.name)) {
    const resetPatient = await prisma.patient.update({
      where: { id: visit.patientId },
      data: { kakaoChannelConnected: false, kakaoChannelConnectedByStaffId: null, kakaoChannelConnectedAt: null },
    });
    visit.patient = resetPatient;
  }

  return NextResponse.json(visit, { status: 201 });
}
