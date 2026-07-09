import { prisma } from "@/lib/db";
import { shiftPastClosedDays, countOpenDaysBetween } from "@/lib/business-days";

const TALK_TASK_TYPES = ["DAY2", "DAY7", "THIRD_VISIT"] as const;
type TalkTaskType = (typeof TALK_TASK_TYPES)[number];

const INITIAL_VISIT_TYPE_NAMES = ["초진", "재초진"];

// 2일톡은 "내원 다음날 안부"라는 즉시성이 취지라 오래 방치되면 의미가 없어진다.
// 마감일로부터 진료일(휴진일 제외) 기준 3일 넘게 미처리 상태면 자동으로 보류 처리한다.
const DAY2_AUTO_SKIP_AFTER_DAYS = 3;

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function diffDays(a: Date, b: Date): number {
  const DAY_MS = 24 * 60 * 60 * 1000;
  return Math.round((startOfDay(a).getTime() - startOfDay(b).getTime()) / DAY_MS);
}

/**
 * 처방주기 자동생성(src/lib/prescriptions.ts)과 같은 패턴으로,
 * 2일톡/7일톡/3회톡 대상 환자를 찾아 TodoTask를 생성한다.
 * 발송 여부의 진실 원천은 항상 MessageLog이며, 이미 발송확인됐거나
 * 이미 생성된 미완료 톡 TodoTask가 있으면 다시 만들지 않는다.
 * 조회(GET /api/todo-tasks) 시마다 호출되는 자가 치유형 생성 함수.
 */
export async function generateTalkTodos(): Promise<{ created: number }> {
  const today = startOfDay(new Date());

  const [patients, sentLogs, openTalkTodos] = await Promise.all([
    prisma.patient.findMany({
      include: {
        visits: {
          where: { isActive: true },
          include: { visitType: true },
          orderBy: [{ visitDate: "asc" }, { createdAt: "asc" }],
        },
      },
    }),
    prisma.messageLog.findMany({
      where: { messageType: { in: [...TALK_TASK_TYPES] }, sentDate: { not: null } },
      select: { patientId: true, messageType: true },
    }),
    prisma.todoTask.findMany({
      where: { patientId: { not: null }, taskType: { in: [...TALK_TASK_TYPES] } },
      select: { id: true, patientId: true, taskType: true, dueDate: true },
    }),
  ]);

  const sentKeys = new Set(sentLogs.map((l) => `${l.patientId}:${l.messageType}`));
  const openTaskByKey = new Map(openTalkTodos.map((t) => [`${t.patientId}:${t.taskType}`, t]));

  /**
   * 7일톡은 "마지막 내원일"을 기준으로 dueDate를 계산하는데, 환자가 톡 미해결 상태에서
   * 다시 내원하면 "마지막 내원일"이 갱신되어 기존 TodoTask의 dueDate가 더 이상 실제
   * 상황과 안 맞게 된다(재방문했는데도 예전 미내원 알림이 계속 남아 "조기 노출"처럼
   * 보이는 버그). shouldCreate가 단순히 열린 항목 존재 여부만 보고 재생성을 막아버려서
   * 스스로 고쳐지지 않았던 부분 — 여기서 유효기간이 지난(dueDate 불일치) 미해결 DAY7을
   * 먼저 무효화(삭제)해서, 최신 내원 기준으로 다시 평가되게 한다.
   */
  const staleTaskIdsToDelete: number[] = [];
  for (const patient of patients) {
    const visits = patient.visits;
    if (visits.length === 0) continue;
    const key = `${patient.id}:DAY7`;
    const existing = openTaskByKey.get(key);
    if (!existing) continue;
    const lastVisit = visits[visits.length - 1];
    const expectedDueDate = shiftPastClosedDays(addDays(lastVisit.visitDate, 7));
    // DAY7은 WORK와 달리 항상 dueDate가 채워지는 톡류 타입이라 non-null 단언.
    if (expectedDueDate.getTime() !== existing.dueDate!.getTime()) {
      staleTaskIdsToDelete.push(existing.id);
      openTaskByKey.delete(key);
    }
  }
  if (staleTaskIdsToDelete.length > 0) {
    await prisma.todoTask.deleteMany({ where: { id: { in: staleTaskIdsToDelete } } });
  }

  function shouldCreate(patientId: number, taskType: TalkTaskType): boolean {
    const key = `${patientId}:${taskType}`;
    return !sentKeys.has(key) && !openTaskByKey.has(key);
  }

  const toCreate: {
    patientId: number;
    taskType: TalkTaskType;
    dueDate: Date;
    staffUserId: number | null;
  }[] = [];

  for (const patient of patients) {
    const visits = patient.visits;
    if (visits.length === 0) continue;

    // 2일톡: 초진/재초진으로 내원한 다음날
    if (shouldCreate(patient.id, "DAY2")) {
      const initialVisit = visits.find((v) => INITIAL_VISIT_TYPE_NAMES.includes(v.visitType.name));
      if (initialVisit) {
        toCreate.push({
          patientId: patient.id,
          taskType: "DAY2",
          dueDate: shiftPastClosedDays(addDays(initialVisit.visitDate, 1)),
          staffUserId: initialVisit.checkedByUserId,
        });
      }
    }

    // 7일톡: 초진/재초진으로 시작한 환자만 대상 — 마지막 내원일로부터 7일 경과
    // (마지막 내원이므로 그 사이 재방문 없음은 자동 충족). 초진/재초진 이력이 아예
    // 없는 환자(예: 재진만 있는 기존 환자)까지 대상이 되던 버그를 막기 위한 조건.
    if (shouldCreate(patient.id, "DAY7")) {
      const hasInitialVisit = visits.some((v) => INITIAL_VISIT_TYPE_NAMES.includes(v.visitType.name));
      const lastVisit = visits[visits.length - 1];
      if (hasInitialVisit && diffDays(today, lastVisit.visitDate) >= 7) {
        toCreate.push({
          patientId: patient.id,
          taskType: "DAY7",
          dueDate: shiftPastClosedDays(addDays(lastVisit.visitDate, 7)),
          staffUserId: lastVisit.checkedByUserId,
        });
      }
    }

    // 3회톡: 초진/재초진으로 시작한 환자만 대상 — 누적 내원 3회 이상 달성
    // (DAY7과 동일한 이유로 조건 추가 — 재진 이력만 있는 기존 환자까지 대상이 되던 버그)
    if (shouldCreate(patient.id, "THIRD_VISIT") && visits.length >= 3) {
      const hasInitialVisit = visits.some((v) => INITIAL_VISIT_TYPE_NAMES.includes(v.visitType.name));
      if (hasInitialVisit) {
        const thirdVisit = visits[2];
        toCreate.push({
          patientId: patient.id,
          taskType: "THIRD_VISIT",
          dueDate: thirdVisit.visitDate,
          staffUserId: thirdVisit.checkedByUserId,
        });
      }
    }
  }

  /**
   * 마감일로부터 DAY2_AUTO_SKIP_AFTER_DAYS일 넘게 미해결(발송/보류 이력 없음)인
   * 2일톡을 자동 보류 처리한다. 기존 수동 보류(skipMessage)와 동일하게 TodoTask는
   * 그대로 두고 MessageLog만 갱신 — 재생성 방지 로직이 그대로 적용된다.
   *
   * 반드시 위 toCreate 루프 다음에 와야 한다 — 소급입력(과거 방문일)으로 막 생성되는
   * DAY2도 같은 호출 안에서 곧바로 평가 대상에 포함시키기 위함이다. 원래는 이 블록이
   * toCreate 루프보다 먼저 있어서, 이번 호출에서 막 만들어질 예정인 신규 DAY2는 아직
   * openTalkTodos 스냅샷(DB 조회 시점)에 없어 자동보류 대상에서 빠졌었다 — 그 결과
   * "소급입력 직후 1회는 미발송으로 보이고, 다음 조회(새로고침) 때야 보류 처리"되는
   * 버그가 있었다(등록일/방문일 기준 계산 자체는 문제 없었음).
   */
  const day2CandidateSource = [
    ...openTalkTodos,
    ...toCreate.map((t) => ({ patientId: t.patientId as number | null, taskType: t.taskType, dueDate: t.dueDate })),
  ];
  const day2AutoSkipCandidates = day2CandidateSource.filter(
    (t) => t.taskType === "DAY2" && countOpenDaysBetween(t.dueDate!, today) > DAY2_AUTO_SKIP_AFTER_DAYS,
  );
  if (day2AutoSkipCandidates.length > 0) {
    const candidatePatientIds = day2AutoSkipCandidates.map((t) => t.patientId as number);
    const existingLogs = await prisma.messageLog.findMany({
      where: { patientId: { in: candidatePatientIds }, messageType: "DAY2" },
    });
    const resolvedPatientIds = new Set(
      existingLogs.filter((l) => l.sentDate || l.skippedAt).map((l) => l.patientId),
    );
    const toAutoSkip = day2AutoSkipCandidates.filter((t) => !resolvedPatientIds.has(t.patientId as number));
    for (const t of toAutoSkip) {
      await prisma.messageLog.upsert({
        where: { patientId_messageType: { patientId: t.patientId as number, messageType: "DAY2" } },
        update: { skippedAt: new Date(), skippedByUserId: null },
        create: { patientId: t.patientId as number, messageType: "DAY2", skippedAt: new Date(), skippedByUserId: null },
      });
    }
  }

  if (toCreate.length === 0) return { created: 0 };

  const result = await prisma.todoTask.createMany({ data: toCreate });
  return { created: result.count };
}
