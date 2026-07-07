import { prisma } from "@/lib/db";

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Whole-day difference between two dates, immune to month/year boundaries. */
function diffDays(a: Date, b: Date): number {
  return Math.round((startOfDay(a).getTime() - startOfDay(b).getTime()) / DAY_MS);
}

function dateKey(date: Date): string {
  return startOfDay(date).toISOString();
}

export type CategoryPatientCount = {
  categoryId: number;
  categoryName: string;
  patientCount: number;
};

export type DashboardStats = {
  totalPatients: number;
  visitsPerCategory: CategoryPatientCount[];
  todayVisitCount: number;
  todayReservationRate: number;
  last7DaysAvgReservationRate: number;
  last7DaysAvgVisitsPerDay: number;
  visitsPerPatient: number;
  sevenDayRevisitRate: number;
  threeVisitFirstVisitRate: number;
};

export async function computeDashboardStats(): Promise<DashboardStats> {
  const [totalPatients, treatmentCategories, allVisits] = await Promise.all([
    prisma.patient.count(),
    prisma.treatmentCategory.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.visit.findMany({
      include: { treatmentCategory: true, visitType: true },
      orderBy: [{ visitDate: "asc" }, { createdAt: "asc" }],
    }),
  ]);

  const today = startOfDay(new Date());
  const totalVisits = allVisits.length;

  // 진료분야별 고유 환자 수 (전체 누적 기준)
  const patientsByCategory = new Map<number, Set<number>>();
  for (const visit of allVisits) {
    const set = patientsByCategory.get(visit.treatmentCategoryId) ?? new Set<number>();
    set.add(visit.patientId);
    patientsByCategory.set(visit.treatmentCategoryId, set);
  }
  const visitsPerCategory: CategoryPatientCount[] = treatmentCategories.map((category) => ({
    categoryId: category.id,
    categoryName: category.name,
    patientCount: patientsByCategory.get(category.id)?.size ?? 0,
  }));

  // 오늘 예약율
  const todayVisits = allVisits.filter((v) => diffDays(v.visitDate, today) === 0);
  const todayReservationRate =
    todayVisits.length === 0
      ? 0
      : todayVisits.filter((v) => v.isReserved).length / todayVisits.length;

  // 최근 7일(오늘 포함) 방문
  const last7DaysVisits = allVisits.filter((v) => {
    const d = diffDays(today, v.visitDate);
    return d >= 0 && d <= 6;
  });

  // 최근 7일 평균 예약율: 방문이 있었던 날짜만 대상으로 일별 예약율을 평균
  const byDay = new Map<string, { total: number; reserved: number }>();
  for (const visit of last7DaysVisits) {
    const key = dateKey(visit.visitDate);
    const entry = byDay.get(key) ?? { total: 0, reserved: 0 };
    entry.total += 1;
    if (visit.isReserved) entry.reserved += 1;
    byDay.set(key, entry);
  }
  const dailyRates = Array.from(byDay.values()).map((d) => d.reserved / d.total);
  const last7DaysAvgReservationRate =
    dailyRates.length === 0 ? 0 : dailyRates.reduce((a, b) => a + b, 0) / dailyRates.length;

  // 일평균 내원수 (최근 7일 내원수 / 7)
  const last7DaysAvgVisitsPerDay = last7DaysVisits.length / 7;

  // 인당 내원수 (전체 누적, 월 경계 없음)
  const visitsPerPatient = totalPatients === 0 ? 0 : totalVisits / totalPatients;

  // 환자별 방문 이력 (이미 visitDate → createdAt 오름차순으로 정렬되어 있음)
  const visitsByPatient = new Map<number, typeof allVisits>();
  for (const visit of allVisits) {
    const list = visitsByPatient.get(visit.patientId) ?? [];
    list.push(visit);
    visitsByPatient.set(visit.patientId, list);
  }

  // 7일 재방문율: 첫 방문 대비 두 번째 방문이 7일 이내인 환자 비율 (전체 기간 기준)
  let revisitEligible = 0;
  let revisitWithin7Days = 0;
  for (const visits of visitsByPatient.values()) {
    revisitEligible += 1;
    if (visits.length >= 2 && diffDays(visits[1].visitDate, visits[0].visitDate) <= 7) {
      revisitWithin7Days += 1;
    }
  }
  const sevenDayRevisitRate = revisitEligible === 0 ? 0 : revisitWithin7Days / revisitEligible;

  // 3회 이상 내원한 초진 환자 비율: 첫 방문 유형이 "초진"인 환자 중 전체 방문이 3회 이상인 비율
  let firstVisitIsInitial = 0;
  let firstVisitIsInitialWith3Plus = 0;
  for (const visits of visitsByPatient.values()) {
    if (visits[0].visitType.name !== "초진") continue;
    firstVisitIsInitial += 1;
    if (visits.length >= 3) firstVisitIsInitialWith3Plus += 1;
  }
  const threeVisitFirstVisitRate =
    firstVisitIsInitial === 0 ? 0 : firstVisitIsInitialWith3Plus / firstVisitIsInitial;

  return {
    totalPatients,
    visitsPerCategory,
    todayVisitCount: todayVisits.length,
    todayReservationRate,
    last7DaysAvgReservationRate,
    last7DaysAvgVisitsPerDay,
    visitsPerPatient,
    sevenDayRevisitRate,
    threeVisitFirstVisitRate,
  };
}

export type DailyStat = {
  date: string; // YYYY-MM-DD
  day: number;
  visitCount: number;
  reservationRate: number | null; // null = 해당 날짜에 내원 기록 없음
};

export type MonthlyDailyStats = {
  year: number;
  month: number; // 1-12
  daysInMonth: number;
  daily: DailyStat[];
  monthTotalVisits: number;
  monthAvgReservationRate: number;
};

/** 이번 달 1일~말일까지의 일별 내원수/예약율 및 월 누적 지표. */
export async function computeMonthlyDailyStats(): Promise<MonthlyDailyStats> {
  const today = startOfDay(new Date());
  const year = today.getFullYear();
  const month = today.getMonth(); // 0-based
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 1);

  const monthVisits = await prisma.visit.findMany({
    where: { visitDate: { gte: monthStart, lt: monthEnd } },
  });

  const byDay = new Map<number, { total: number; reserved: number }>();
  for (const visit of monthVisits) {
    const day = visit.visitDate.getDate();
    const entry = byDay.get(day) ?? { total: 0, reserved: 0 };
    entry.total += 1;
    if (visit.isReserved) entry.reserved += 1;
    byDay.set(day, entry);
  }

  const daily: DailyStat[] = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const entry = byDay.get(day);
    const dateObj = new Date(year, month, day);
    daily.push({
      date: `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
      day,
      visitCount: entry?.total ?? 0,
      reservationRate: entry && entry.total > 0 ? entry.reserved / entry.total : null,
    });
  }

  const daysWithVisits = daily.filter((d) => d.reservationRate !== null);
  const monthAvgReservationRate =
    daysWithVisits.length === 0
      ? 0
      : daysWithVisits.reduce((sum, d) => sum + (d.reservationRate ?? 0), 0) /
        daysWithVisits.length;

  return {
    year,
    month: month + 1,
    daysInMonth,
    daily,
    monthTotalVisits: monthVisits.length,
    monthAvgReservationRate,
  };
}

function startOfWeekMonday(date: Date): Date {
  const day = startOfDay(date);
  const weekday = day.getDay(); // 0=일 ... 6=토
  const diffToMonday = weekday === 0 ? -6 : 1 - weekday;
  return new Date(day.getFullYear(), day.getMonth(), day.getDate() + diffToMonday);
}

export type TodoWeeklySummary = {
  weekDone: number;
  weekTotal: number;
};

const TALK_TASK_TYPES = ["DAY2", "DAY7", "THIRD_VISIT"];

/**
 * 이번 주(월~일) 기준 생성된/완료된 TodoTask 건수.
 * 톡 할일은 TodoTask.isDone을 쓰지 않으므로(완료 여부의 진실 원천은 MessageLog),
 * 톡 항목의 완료는 해당 (patientId, taskType)에 대응하는 MessageLog의 sentDate로 판단한다.
 */
export async function computeTodoWeeklySummary(): Promise<TodoWeeklySummary> {
  const weekStart = startOfWeekMonday(new Date());
  const weekEnd = new Date(
    weekStart.getFullYear(),
    weekStart.getMonth(),
    weekStart.getDate() + 7,
  );

  const [weekTotal, weekDonePrescription, talkTodos, talkLogsDoneThisWeek] = await Promise.all([
    prisma.todoTask.count({
      where: { createdAt: { gte: weekStart, lt: weekEnd } },
    }),
    prisma.todoTask.count({
      where: { prescriptionId: { not: null }, isDone: true, doneAt: { gte: weekStart, lt: weekEnd } },
    }),
    prisma.todoTask.findMany({
      where: { patientId: { not: null }, taskType: { in: TALK_TASK_TYPES } },
      select: { patientId: true, taskType: true },
    }),
    prisma.messageLog.findMany({
      where: { messageType: { in: TALK_TASK_TYPES }, sentDate: { gte: weekStart, lt: weekEnd } },
      select: { patientId: true, messageType: true },
    }),
  ]);

  const talkTodoKeys = new Set(talkTodos.map((t) => `${t.patientId}:${t.taskType}`));
  const weekDoneTalk = talkLogsDoneThisWeek.filter((log) =>
    talkTodoKeys.has(`${log.patientId}:${log.messageType}`),
  ).length;

  return { weekDone: weekDonePrescription + weekDoneTalk, weekTotal };
}
