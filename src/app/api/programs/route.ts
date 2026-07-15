import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isDirector } from "@/lib/staff-auth";
import {
  createProgram,
  DuplicateActiveProgramNameError,
  InactiveProgramNameConflictError,
} from "@/lib/programs";

// includeInactive=1이면 설정 화면(/settings/programs)의 "전체 목록(활성/비활성)"용으로
// 비활성까지 함께 내려준다 — 기본값(파라미터 없음)은 기존 그대로 활성만(처방 등록 화면 등
// 기존 호출부 회귀 없음).
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const includeInactive = searchParams.get("includeInactive") === "1";
  const programs = await prisma.program.findMany({
    where: includeInactive ? undefined : { isActive: true },
    orderBy: { sortOrder: "asc" },
  });
  return NextResponse.json(programs);
}

// 원장 전용(task2.md) — core-profile 라우트와 동일한 서버단 재검증 패턴(완벽한 인증이
// 아니라 실수/오남용 방지 목적, staff-auth.ts 참고).
export async function POST(request: Request) {
  const body = await request.json();
  const staffUserId = Number(body.staffUserId);
  if (!staffUserId || !(await isDirector(staffUserId))) {
    return NextResponse.json({ error: "원장만 프로그램을 등록할 수 있습니다." }, { status: 403 });
  }

  const name = String(body.name ?? "").trim();
  const totalDurationWeeks = Number(body.totalDurationWeeks);
  const splitIntervalDays = Number(body.splitIntervalDays);
  const confirmed = body.confirmed === true;

  if (!name) {
    return NextResponse.json({ error: "프로그램 명칭을 입력하세요." }, { status: 400 });
  }
  if (!Number.isFinite(totalDurationWeeks) || totalDurationWeeks <= 0) {
    return NextResponse.json({ error: "총 기간(주)을 입력하세요." }, { status: 400 });
  }
  const VALID_CYCLE_DAYS = [7, 14, 21, 28] as const;
  if (!(VALID_CYCLE_DAYS as readonly number[]).includes(splitIntervalDays)) {
    return NextResponse.json({ error: "해피톡 주기는 1주/2주/3주/4주 중에서 선택하세요." }, { status: 400 });
  }

  try {
    // 주 -> 일수 환산(1주=7일). 기존 "개월" 단위(1개월=30일)에서 "주" 단위로 전환하면서
    // 1개월=4주(28일) 관례로 통일했다(task.md) — 기존 3개월(90일) 프로그램들도 마이그레이션
    // 스크립트로 12주(84일)로 환산 저장됨.
    const program = await createProgram({
      name,
      totalDurationDays: Math.round(totalDurationWeeks * 7),
      splitIntervalDays: splitIntervalDays as 7 | 14 | 21 | 28,
      confirmed,
    });
    return NextResponse.json(program, { status: 201 });
  } catch (err) {
    if (err instanceof DuplicateActiveProgramNameError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    if (err instanceof InactiveProgramNameConflictError) {
      return NextResponse.json({ error: err.message, warning: "INACTIVE_NAME_CONFLICT" }, { status: 409 });
    }
    const message = err instanceof Error ? err.message : "프로그램 등록에 실패했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
