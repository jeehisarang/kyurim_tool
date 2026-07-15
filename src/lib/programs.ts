import { prisma } from "@/lib/db";

// 이번 등록 화면(task2.md)이 다루는 스코프는 분할처방(SPLIT, 예: 탕약/환/킬팻캡슐 기간
// 티어)뿐 — "해피톡 주기 2주/4주" 선택 자체가 SPLIT 전용 개념이라 type은 항상 이 값으로
// 고정한다. SINGLE/FIXED_SEQUENCE(체험 시퀀스 등) 등록은 이번 범위 밖.
const PROGRAM_TYPE_SPLIT = "SPLIT";

// 이름 중복 판별용 정규화 — 대소문자/앞뒤·중복 공백 차이로 인한 중복 등록을 막는다
// (task2.md 지시 — 예: "강근단" vs "강근단 ").
function normalizeProgramName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

export class DuplicateActiveProgramNameError extends Error {
  constructor() {
    super("이미 등록된 프로그램명입니다.");
    this.name = "DuplicateActiveProgramNameError";
  }
}

// 비활성 프로그램과만 이름이 겹치는 경우 — 차단하지 않고 확인 후 계속 생성할 수 있게
// 경고만 던진다(task2.md 1항, 실수로 옛 프로그램을 재활성화하는 대신 새로 만드는 걸
// 막지 않기 위함). API 라우트가 이 메시지를 그대로 클라이언트에 전달해 window.confirm에
// 쓰고, 사용자가 계속하기를 선택하면 confirmed:true로 재요청한다.
export class InactiveProgramNameConflictError extends Error {
  constructor(existingName: string) {
    super(`비활성 상태의 동일한 이름의 프로그램이 있습니다("${existingName}"). 계속하시겠습니까?`);
    this.name = "InactiveProgramNameConflictError";
  }
}

export type CreateProgramInput = {
  name: string;
  totalDurationDays: number;
  splitIntervalDays: 7 | 14 | 21 | 28;
  confirmed?: boolean;
};

/**
 * 원장 전용 신규 프로그램 등록(task2.md) — 검사연동(linkedTestType은 ProgramTeaching 쪽
 * 개념이라 Program 자체엔 없음)/카테고리는 이번 범위 밖이라 별도 처리 없이 그대로 둔다.
 * 카테고리는 program-categories.ts의 이름 매핑에 없으면 화면에서 자동으로 "기타"로
 * 분류되므로(매핑 실패 시 안전한 폴백) 이 함수가 따로 신경 쓸 필요가 없다.
 */
export async function createProgram(input: CreateProgramInput) {
  const normalized = normalizeProgramName(input.name);
  const existing = await prisma.program.findMany();

  const activeConflict = existing.find((p) => p.isActive && normalizeProgramName(p.name) === normalized);
  if (activeConflict) throw new DuplicateActiveProgramNameError();

  const inactiveConflict = existing.find(
    (p) => !p.isActive && normalizeProgramName(p.name) === normalized,
  );
  if (inactiveConflict && !input.confirmed) {
    throw new InactiveProgramNameConflictError(inactiveConflict.name);
  }

  const maxSortOrder = existing.reduce((max, p) => Math.max(max, p.sortOrder), -1);

  // Program.name은 DB에서 @unique라(과거 이력 표시를 위해 비활성 레코드도 이름을 그대로
  // 유지하는 기존 관례, program-categories.ts 참고) 신규 활성 레코드와 이름이 완전히
  // 같은 채로 공존할 수 없다. task2.md 지시대로 "새로 만드는 걸 막지 않기" 위해, 확인 후
  // 계속하는 경우 옛 비활성 레코드 쪽을 날짜 붙은 이름으로 살짝 밀어내고 새 이름을
  // 비워준다 — 데이터를 지우거나 재활성화하지 않고 그대로 보존하면서 이름만 구분한다.
  if (inactiveConflict && input.confirmed) {
    const today = new Date().toISOString().slice(0, 10);
    await prisma.program.update({
      where: { id: inactiveConflict.id },
      data: { name: `${inactiveConflict.name} (이전, ~${today})` },
    });
  }

  return prisma.program.create({
    data: {
      name: input.name.trim(),
      type: PROGRAM_TYPE_SPLIT,
      splitIntervalDays: input.splitIntervalDays,
      totalDurationDays: input.totalDurationDays,
      followUpDays: null,
      isActive: true,
      sortOrder: maxSortOrder + 1,
    },
  });
}
