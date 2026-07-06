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
    todayReservationRate,
    last7DaysAvgReservationRate,
    last7DaysAvgVisitsPerDay,
    visitsPerPatient,
    sevenDayRevisitRate,
    threeVisitFirstVisitRate,
  };
}
