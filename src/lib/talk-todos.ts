import { prisma } from "@/lib/db";

const TALK_TASK_TYPES = ["DAY2", "DAY7", "THIRD_VISIT"] as const;
type TalkTaskType = (typeof TALK_TASK_TYPES)[number];

const INITIAL_VISIT_TYPE_NAMES = ["초진", "재초진"];

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
      select: { patientId: true, taskType: true },
    }),
  ]);

  const sentKeys = new Set(sentLogs.map((l) => `${l.patientId}:${l.messageType}`));
  const openKeys = new Set(openTalkTodos.map((t) => `${t.patientId}:${t.taskType}`));

  function shouldCreate(patientId: number, taskType: TalkTaskType): boolean {
    const key = `${patientId}:${taskType}`;
    return !sentKeys.has(key) && !openKeys.has(key);
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
          dueDate: addDays(initialVisit.visitDate, 1),
          staffUserId: initialVisit.checkedByUserId,
        });
      }
    }

    // 7일톡: 마지막 내원일로부터 7일 경과 (마지막 내원이므로 그 사이 재방문 없음은 자동 충족)
    if (shouldCreate(patient.id, "DAY7")) {
      const lastVisit = visits[visits.length - 1];
      if (diffDays(today, lastVisit.visitDate) >= 7) {
        toCreate.push({
          patientId: patient.id,
          taskType: "DAY7",
          dueDate: addDays(lastVisit.visitDate, 7),
          staffUserId: lastVisit.checkedByUserId,
        });
      }
    }

    // 3회톡: 누적 내원 3회 이상 달성
    if (shouldCreate(patient.id, "THIRD_VISIT") && visits.length >= 3) {
      const thirdVisit = visits[2];
      toCreate.push({
        patientId: patient.id,
        taskType: "THIRD_VISIT",
        dueDate: thirdVisit.visitDate,
        staffUserId: thirdVisit.checkedByUserId,
      });
    }
  }

  if (toCreate.length === 0) return { created: 0 };

  const result = await prisma.todoTask.createMany({ data: toCreate });
  return { created: result.count };
}
