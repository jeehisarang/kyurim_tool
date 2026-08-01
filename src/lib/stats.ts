import { prisma } from "@/lib/db";
import {
  getProgramCategory,
  PROGRAM_CATEGORY_ORDER,
  type ProgramCategoryKey,
} from "@/lib/program-categories";
import type { StatsPeriod } from "@/lib/stats-period";

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
      where: { isActive: true },
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

export type DashboardStatsWithMeta = DashboardStats & { snapshotAt: string | null };

const DASHBOARD_SNAPSHOT_HOUR = 3;

function snapshotRowToStats(row: {
  totalPatients: number;
  visitsPerCategoryJson: string;
  todayVisitCount: number;
  todayReservationRate: number;
  last7DaysAvgReservationRate: number;
  last7DaysAvgVisitsPerDay: number;
  visitsPerPatient: number;
  sevenDayRevisitRate: number;
  threeVisitFirstVisitRate: number;
  createdAt: Date;
}): DashboardStatsWithMeta {
  return {
    totalPatients: row.totalPatients,
    visitsPerCategory: JSON.parse(row.visitsPerCategoryJson) as CategoryPatientCount[],
    todayVisitCount: row.todayVisitCount,
    todayReservationRate: row.todayReservationRate,
    last7DaysAvgReservationRate: row.last7DaysAvgReservationRate,
    last7DaysAvgVisitsPerDay: row.last7DaysAvgVisitsPerDay,
    visitsPerPatient: row.visitsPerPatient,
    sevenDayRevisitRate: row.sevenDayRevisitRate,
    threeVisitFirstVisitRate: row.threeVisitFirstVisitRate,
    snapshotAt: row.createdAt.toISOString(),
  };
}

/**
 * 새벽 배치(instrumentation-node.ts 폴러)가 호출 — 오늘자 스냅샷이 이미 있으면 아무것도
 * 하지 않고, 없고 지금이 새벽 3시(DASHBOARD_SNAPSHOT_HOUR) 이후면 computeDashboardStats()를
 * 실행해 저장한다. 시각 게이트를 두는 이유는 "환자 없는 시간대에 계산"이라는 취지 때문이지,
 * 정확성을 위한 건 아니다 — 실패해도 다음 폴링 주기에 그대로 재시도된다(멱등, snapshotDate
 * unique라 중복 생성 불가).
 */
export async function ensureTodayDashboardSnapshot(): Promise<void> {
  const now = new Date();
  if (now.getHours() < DASHBOARD_SNAPSHOT_HOUR) return;

  const today = startOfDay(now);
  const existing = await prisma.dashboardStatsSnapshot.findUnique({ where: { snapshotDate: today } });
  if (existing) return;

  const stats = await computeDashboardStats();
  try {
    await prisma.dashboardStatsSnapshot.create({
      data: {
        snapshotDate: today,
        totalPatients: stats.totalPatients,
        visitsPerCategoryJson: JSON.stringify(stats.visitsPerCategory),
        todayVisitCount: stats.todayVisitCount,
        todayReservationRate: stats.todayReservationRate,
        last7DaysAvgReservationRate: stats.last7DaysAvgReservationRate,
        last7DaysAvgVisitsPerDay: stats.last7DaysAvgVisitsPerDay,
        visitsPerPatient: stats.visitsPerPatient,
        sevenDayRevisitRate: stats.sevenDayRevisitRate,
        threeVisitFirstVisitRate: stats.threeVisitFirstVisitRate,
      },
    });
  } catch {
    // 동시 폴링 등으로 그 사이 다른 프로세스가 이미 만들었을 수 있음(unique 충돌) — 무해하므로 무시.
  }
}

/**
 * /api/dashboard 전용 — 오늘자 스냅샷이 있으면 그걸 읽어서 반환(빠름), 없으면(배치가 아직
 * 안 돌았거나 실패한 경우) computeDashboardStats()로 실시간 폴백한다(주의사항: 빈 화면보다
 * 느리더라도 실시간 계산이 낫다). snapshotAt이 null이면 화면에서 "실시간 계산"으로 표시.
 */
export async function getDashboardStatsForApi(): Promise<DashboardStatsWithMeta> {
  const today = startOfDay(new Date());
  const snapshot = await prisma.dashboardStatsSnapshot.findUnique({ where: { snapshotDate: today } });
  if (snapshot) return snapshotRowToStats(snapshot);

  const stats = await computeDashboardStats();
  return { ...stats, snapshotAt: null };
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
    where: { visitDate: { gte: monthStart, lt: monthEnd }, isActive: true },
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

  const [weekTotal, weekDonePrescription, talkTodos, talkLogsDoneThisWeek, weekDoneProgramEvent, weekDoneWork] =
    await Promise.all([
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
      // 프로그램 이벤트(예: 킬팻캡슐 3일체험 TRIAL_*)는 prescriptionId를 가지지만 톡류라
      // TodoTask.isDone이 아니라 ProgramEventLog.sentDate로 완료를 판단해야 한다.
      prisma.programEventLog.count({
        where: { sentDate: { gte: weekStart, lt: weekEnd } },
      }),
      // WORK(업무/요청)는 처방류와 동일한 체크형(TodoTask.isDone 진실원천)이지만
      // prescriptionId가 없어 weekDonePrescription 카운트에 안 잡히므로 별도 집계.
      prisma.todoTask.count({
        where: { taskType: "WORK", isDone: true, doneAt: { gte: weekStart, lt: weekEnd } },
      }),
    ]);

  const talkTodoKeys = new Set(talkTodos.map((t) => `${t.patientId}:${t.taskType}`));
  const weekDoneTalk = talkLogsDoneThisWeek.filter((log) =>
    talkTodoKeys.has(`${log.patientId}:${log.messageType}`),
  ).length;

  return {
    weekDone: weekDonePrescription + weekDoneTalk + weekDoneProgramEvent + weekDoneWork,
    weekTotal,
  };
}

export type ProgramActiveCount = {
  programId: number;
  programName: string;
  activePatientCount: number;
};

export type CategoryActiveCount = {
  category: ProgramCategoryKey;
  activePatientCount: number;
  programs: ProgramActiveCount[];
};

export type PrescriptionStats = {
  perProgram: ProgramActiveCount[];
  perCategory: CategoryActiveCount[];
  newThisMonth: number;
};

/**
 * 치료처방 리스트 화면 상단 요약 카드용: 카테고리(탕약/환/킬팻캡슐)별 + 프로그램별
 * 진행 중 환자 수 + 이번달 신규 등록 수. 카테고리 합산은 프로그램별 합을 그대로
 * 더하는 게 아니라 환자 단위로 다시 집계한다 — 한 환자가 같은 카테고리의 서로 다른
 * 프로그램을 동시에 진행 중이어도 중복 카운트되지 않도록 하기 위함.
 */
export async function computePrescriptionStats(): Promise<PrescriptionStats> {
  const today = startOfDay(new Date());
  const year = today.getFullYear();
  const month = today.getMonth();
  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 1);

  const [activePrescriptions, newThisMonth] = await Promise.all([
    prisma.prescription.findMany({
      where: { status: "ACTIVE" },
      select: { patientId: true, program: { select: { id: true, name: true } } },
    }),
    prisma.prescription.count({
      where: { createdAt: { gte: monthStart, lt: monthEnd } },
    }),
  ]);

  const byProgram = new Map<number, { name: string; patientIds: Set<number> }>();
  const byCategory = new Map<ProgramCategoryKey, Set<number>>();
  for (const p of activePrescriptions) {
    const entry = byProgram.get(p.program.id) ?? { name: p.program.name, patientIds: new Set<number>() };
    entry.patientIds.add(p.patientId);
    byProgram.set(p.program.id, entry);

    const category = getProgramCategory(p.program.name);
    if (category) {
      const set = byCategory.get(category) ?? new Set<number>();
      set.add(p.patientId);
      byCategory.set(category, set);
    }
  }

  const perProgram = [...byProgram.entries()]
    .map(([programId, { name, patientIds }]) => ({
      programId,
      programName: name,
      activePatientCount: patientIds.size,
    }))
    .sort((a, b) => b.activePatientCount - a.activePatientCount);

  const perCategory: CategoryActiveCount[] = PROGRAM_CATEGORY_ORDER.filter((c) => byCategory.has(c)).map(
    (category) => ({
      category,
      activePatientCount: byCategory.get(category)!.size,
      programs: perProgram.filter((p) => getProgramCategory(p.programName) === category),
    }),
  );

  return { perProgram, perCategory, newThisMonth };
}

/** period 시작~끝(exclusive) 범위. "7d"/"30d"는 오늘 포함 롤링 구간, "thisMonth"는 이번달 1일~다음달 1일. */
function periodRange(period: StatsPeriod, now: Date): { start: Date; end: Date } {
  const today = startOfDay(now);
  if (period === "thisMonth") {
    return {
      start: new Date(today.getFullYear(), today.getMonth(), 1),
      end: new Date(today.getFullYear(), today.getMonth() + 1, 1),
    };
  }
  const daysBack = period === "7d" ? 6 : 29; // 오늘 포함이라 7일=오늘-6, 30일=오늘-29
  return {
    start: new Date(today.getFullYear(), today.getMonth(), today.getDate() - daysBack),
    end: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1),
  };
}

export type PeriodStats = {
  reservationRate: number;
  visitsPerPatient: number;
  // 4단계(task2.md 결정2, 근사치) — 링크 생성 건수 대비 firstViewedAt 존재 비율.
  linkClickThroughRate: number;
  linkCount: number;
};

/**
 * 예약율/인당내원수/링크클릭률 카드용 — 기간선택 드롭다운(7일/30일/이번달)에 맞춰 매번
 * 새로 계산한다. computeDashboardStats()와 달리 날짜 범위로 좁혀서 쿼리하므로(전체 Visit
 * 테이블 스캔이 아님) 스냅샷 캐싱 없이 실시간 계산해도 가볍다.
 */
export async function computePeriodStats(period: StatsPeriod): Promise<PeriodStats> {
  const { start, end } = periodRange(period, new Date());

  const [visits, shareLinks, teachingPages] = await Promise.all([
    prisma.visit.findMany({
      where: { isActive: true, visitDate: { gte: start, lt: end } },
      select: { visitDate: true, isReserved: true, patientId: true },
    }),
    prisma.patientShareLink.findMany({
      where: { createdAt: { gte: start, lt: end } },
      select: { firstViewedAt: true },
    }),
    prisma.patientTeachingPage.findMany({
      where: { createdAt: { gte: start, lt: end } },
      select: { firstViewedAt: true },
    }),
  ]);

  // 예약율: 기존 최근7일 평균예약율과 동일 기준(날짜별 예약율을 구해서 평균) — 방문이 많은
  // 날에 가중치가 쏠리지 않도록 날짜 단위로 먼저 평균낸다.
  const byDay = new Map<string, { total: number; reserved: number }>();
  const patientIds = new Set<number>();
  for (const v of visits) {
    const key = dateKey(v.visitDate);
    const entry = byDay.get(key) ?? { total: 0, reserved: 0 };
    entry.total += 1;
    if (v.isReserved) entry.reserved += 1;
    byDay.set(key, entry);
    patientIds.add(v.patientId);
  }
  const dailyRates = Array.from(byDay.values()).map((d) => d.reserved / d.total);
  const reservationRate =
    dailyRates.length === 0 ? 0 : dailyRates.reduce((a, b) => a + b, 0) / dailyRates.length;

  // 인당내원수(기간 한정): 그 기간에 실제로 내원한 환자 기준 — 전체 누적 정의(stats.visitsPerPatient)와
  // 달리 기간이 바뀌면 분모(내원 환자 수)도 함께 바뀐다(task2.md 3단계 지시).
  const visitsPerPatient = patientIds.size === 0 ? 0 : visits.length / patientIds.size;

  const allLinks = [...shareLinks, ...teachingPages];
  const viewedCount = allLinks.filter((l) => l.firstViewedAt !== null).length;
  const linkClickThroughRate = allLinks.length === 0 ? 0 : viewedCount / allLinks.length;

  return {
    reservationRate,
    visitsPerPatient,
    linkClickThroughRate,
    linkCount: allLinks.length,
  };
}

export type MonthlyPatientTrendPoint = {
  month: string; // YYYY-MM
  newPatients: number;
  cumulativeTotal: number;
};

/**
 * 월별 누적환자수 콤보차트용(task.md 2단계) — 환자별 "첫 방문월"을 기준으로 그 달의
 * 신규환자수를 세고, 월 순서대로 누적 합산한다. 인당내원수 등과 동일하게 로컬(=KST) 월
 * 경계 기준(startOfDay/getMonth)을 그대로 쓴다. 데이터가 있는 첫 달부터 이번달까지 반환.
 */
export async function computeMonthlyPatientTrend(): Promise<MonthlyPatientTrendPoint[]> {
  const visits = await prisma.visit.findMany({
    where: { isActive: true },
    select: { patientId: true, visitDate: true },
    orderBy: { visitDate: "asc" },
  });
  if (visits.length === 0) return [];

  function monthKey(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }

  // visits가 visitDate 오름차순이라, 환자별로 처음 만나는 행이 곧 첫 방문이다.
  const firstVisitByPatient = new Map<number, Date>();
  for (const v of visits) {
    if (!firstVisitByPatient.has(v.patientId)) firstVisitByPatient.set(v.patientId, v.visitDate);
  }

  const newPatientsByMonth = new Map<string, number>();
  let minDate = visits[0].visitDate;
  for (const firstDate of firstVisitByPatient.values()) {
    const key = monthKey(firstDate);
    newPatientsByMonth.set(key, (newPatientsByMonth.get(key) ?? 0) + 1);
    if (firstDate < minDate) minDate = firstDate;
  }

  const now = new Date();
  const months: string[] = [];
  let cursor = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
  const last = new Date(now.getFullYear(), now.getMonth(), 1);
  while (cursor <= last) {
    months.push(monthKey(cursor));
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  }

  let cumulativeTotal = 0;
  return months.map((month) => {
    const newPatients = newPatientsByMonth.get(month) ?? 0;
    cumulativeTotal += newPatients;
    return { month, newPatients, cumulativeTotal };
  });
}
