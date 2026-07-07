/**
 * 1회성 데모 시드 스크립트. 홈/대시보드/오늘할일 등 화면을 실데이터 입력 전에
 * 미리 확인해보기 위한 가상 환자 60명 + 7월 1일~7일 내원기록을 생성한다.
 *
 * 실행: npx tsx prisma/seed-demo.ts  (또는 npm run db:seed-demo)
 *
 * 기존 마스터 데이터(진료분야/진료구분/StaffUser/Program)는 건드리지 않고,
 * 그 위에 Patient/Visit만 추가한다. memo에 마커를 남겨 재실행 시 중복 생성을 막는다.
 */
import "dotenv/config";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../src/generated/prisma/client";

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL ?? "file:./dev.db",
});

const prisma = new PrismaClient({ adapter });

const DEMO_MARKER = "[데모 시드 데이터]";

const SURNAMES = [
  "김", "이", "박", "최", "정", "강", "조", "윤", "장", "임",
  "한", "오", "서", "신", "권", "황", "안", "송", "전", "홍",
  "유", "고", "문", "양", "손", "배", "백", "허", "남", "심",
  "노", "하", "곽", "성", "차", "주", "우", "구", "나", "민",
];

const GIVEN_NAMES = [
  "민준", "서연", "도윤", "지우", "하은", "서준", "유진", "지호", "수빈", "예은",
  "준서", "하윤", "지안", "도현", "나은", "시우", "서율", "민서", "예준", "서윤",
  "하람", "은우", "지환", "서영", "민재", "주원", "다은", "준혁", "지민", "유안",
  "태윤", "은서", "시윤", "민규", "은우", "다인", "서진", "자현", "윤슬", "서아",
  "하율", "민찬", "소율", "지안", "태경", "서우", "성일", "영희", "철수", "윤아",
  "재현", "미영", "현우", "소희", "동건", "수정", "가영", "세훈", "지혜", "정민",
];

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick<T>(arr: T[]): T {
  return arr[randomInt(0, arr.length - 1)];
}

function generateName(): string {
  return pick(SURNAMES) + pick(GIVEN_NAMES);
}

function weightedCategory(): string {
  const r = Math.random();
  if (r < 0.7) return "급여치료";
  if (r < 0.85) return "자보";
  if (r < 0.9) return "한약";
  if (r < 0.95) return "비만";
  return "피부·한방성형";
}

function randomVisitType(isFirstVisit: boolean, forceInitial: boolean): string {
  if (isFirstVisit && forceInitial) return "초진";
  const r = Math.random();
  if (r < 0.65) return "재진";
  if (r < 0.85) return "초진";
  if (r < 0.95) return "재초진";
  return "전화상담";
}

// 예약율 47.9% 근처 (45~55% 범위)로 랜덤 배정
function randomIsReserved(): boolean {
  return Math.random() < 0.479;
}

async function generateUniqueChartNumbers(count: number): Promise<string[]> {
  const existing = await prisma.patient.findMany({ select: { chartNumber: true } });
  const used = new Set(existing.map((p) => p.chartNumber));
  const result: string[] = [];
  while (result.length < count) {
    const candidate = String(randomInt(1000, 9999));
    if (used.has(candidate)) continue;
    used.add(candidate);
    result.push(candidate);
  }
  return result;
}

async function main() {
  const alreadySeeded = await prisma.patient.count({
    where: { memo: { contains: DEMO_MARKER } },
  });
  if (alreadySeeded > 0) {
    console.log(
      `이미 데모 시드가 실행된 상태입니다 (마커가 붙은 환자 ${alreadySeeded}명 존재). ` +
        "중복 생성을 막기 위해 스크립트를 종료합니다.",
    );
    return;
  }

  const [categories, visitTypes, staffUsers] = await Promise.all([
    prisma.treatmentCategory.findMany(),
    prisma.visitType.findMany(),
    prisma.staffUser.findMany(),
  ]);
  const categoryByName = new Map(categories.map((c) => [c.name, c]));
  const visitTypeByName = new Map(visitTypes.map((v) => [v.name, v]));

  const PATIENT_COUNT = 60;
  const chartNumbers = await generateUniqueChartNumbers(PATIENT_COUNT);
  const names = shuffle(Array.from({ length: PATIENT_COUNT }, () => generateName()));

  // 7/1 ~ 7/7 (오늘) 사이 여러 번 내원하는 환자 12명을 무작위로 선정
  const multiVisitIndexes = new Set(shuffle([...Array(PATIENT_COUNT).keys()]).slice(0, 12));

  const visitDatesInMonth = [1, 2, 3, 4, 5, 6, 7]; // 7월 1~7일
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-based (6 = 7월)

  let createdPatients = 0;
  let createdVisits = 0;

  for (let i = 0; i < PATIENT_COUNT; i++) {
    const patient = await prisma.patient.create({
      data: {
        chartNumber: chartNumbers[i],
        name: names[i],
        memo: DEMO_MARKER,
      },
    });
    createdPatients += 1;

    const categoryName = weightedCategory();
    const category = categoryByName.get(categoryName)!;

    const isMultiVisit = multiVisitIndexes.has(i);
    const visitCount = isMultiVisit ? randomInt(2, 4) : 1;
    // 3회 이상 초진율 지표가 실제로 나오도록, 다회 내원 환자 중 절반 정도는 첫 방문을 "초진"으로 강제
    const forceInitial = isMultiVisit && Math.random() < 0.5;

    const days = shuffle(visitDatesInMonth).slice(0, visitCount).sort((a, b) => a - b);

    for (let v = 0; v < days.length; v++) {
      const day = days[v];
      // 자정(00:00:00) 고정: /api/visits가 "오늘" 내원을 visitDate와의 정확한 자정 일치로 조회하므로 맞춰준다.
      const visitDate = new Date(year, month, day);
      const visitTypeName = randomVisitType(v === 0, forceInitial);
      const visitType = visitTypeByName.get(visitTypeName)!;
      const staffUser = pick(staffUsers);

      await prisma.visit.create({
        data: {
          patientId: patient.id,
          visitDate,
          treatmentCategoryId: category.id,
          visitTypeId: visitType.id,
          isReserved: randomIsReserved(),
          checkedByUserId: staffUser.id,
        },
      });
      createdVisits += 1;
    }
  }

  console.log(`데모 시드 완료: 환자 ${createdPatients}명, 내원기록 ${createdVisits}건 생성.`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
