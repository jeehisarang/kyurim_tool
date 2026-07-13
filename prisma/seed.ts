import "dotenv/config";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../src/generated/prisma/client";

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL ?? "file:./dev.db",
});

const prisma = new PrismaClient({ adapter });

const treatmentCategories = ["급여치료", "자보", "한약", "비만", "피부·한방성형"];
const visitTypes = ["초진", "재초진", "재진", "전화상담"];
const staffUsers = [
  { name: "김우석", role: "원장" },
  { name: "박간호", role: "직원" },
  { name: "최실장", role: "직원" },
];

// 화면 표기명(Program.name)은 원내 축약 표현("킬캡")을 쓴다 — 환자 발송용 AI 메시지는
// 이 값을 참조하지 않고 src/lib/ai-message.ts에 "킬팻캡슐"이라는 정식 명칭이 별도로
// 하드코딩되어 있으므로, 여기서 표기명을 바꿔도 발송 문구에는 영향이 없다.
//
// 프로그램 분류는 정확한 약 성분 기록이 아니라 톡/처방주기 스케줄링용 대분류일 뿐이다
// (세부 약 이름은 한차트에 별도 기록) — 그래서 최종적으로 탕약/환약/킬팻캡슐 3개 대분류 x
// 기간 티어만 남긴다(탕약 3개 + 환약 2개 + 킬팻캡슐 3개 = 총 8개 활성).
const programs = [
  // 진행 중인 환자가 없어(0건 확인) 삭제 대신 비활성화만 한다 — 세분화 이전 세대의
  // 원형(무티어) 프로그램.
  { name: "킬팻캡슐", type: "SPLIT", splitIntervalDays: 14, totalDurationDays: 90, followUpDays: null, isActive: false },
  // 13-1: 다이어트(비만치료) 본프로그램은 1개월/3개월 티어로 구분 (체험3일과는 별개, FIXED_SEQUENCE 아님).
  { name: "킬캡1개월", type: "SPLIT", splitIntervalDays: 14, totalDurationDays: 30, followUpDays: null, isActive: true },
  { name: "킬캡3개월", type: "SPLIT", splitIntervalDays: 14, totalDurationDays: 90, followUpDays: null, isActive: true },
  // 13-x: 감비탕/황제감비탕 세분화(제품별 티어)로 대체했다가, 다시 탕약/환약 공통 기간 티어로
  // 단순화 — 두 세대 모두 진행 중인 환자가 없어(0건 확인) 삭제 대신 비활성화만 한다(과거
  // 이력이 있는 경우에도 배지가 그대로 표시되어야 하므로 항상 소프트 비활성화 원칙 유지).
  { name: "감비탕", type: "SPLIT", splitIntervalDays: 14, totalDurationDays: 90, followUpDays: null, isActive: false },
  { name: "황제감비탕", type: "SPLIT", splitIntervalDays: 14, totalDurationDays: 90, followUpDays: null, isActive: false },
  { name: "감비탕60포", type: "SPLIT", splitIntervalDays: 14, totalDurationDays: 30, followUpDays: null, isActive: false },
  { name: "감비탕1개월", type: "SPLIT", splitIntervalDays: 14, totalDurationDays: 30, followUpDays: null, isActive: false },
  { name: "감비탕3개월", type: "SPLIT", splitIntervalDays: 14, totalDurationDays: 90, followUpDays: null, isActive: false },
  { name: "황제1개월", type: "SPLIT", splitIntervalDays: 14, totalDurationDays: 30, followUpDays: null, isActive: false },
  { name: "황제3개월", type: "SPLIT", splitIntervalDays: 14, totalDurationDays: 90, followUpDays: null, isActive: false },
  // 환약도 기존 SINGLE(등록 30일 후 단발 후속조치)에서 탕약과 동일한 SPLIT(2주 간격
  // 재진 체크) 방식으로 전환 — "기간+대분류만으로 충분" 원칙에 따라 세 카테고리(탕/환/캡슐)
  // 모두 동일한 스케줄링 구조로 통일한다(원장 확인).
  { name: "S환", type: "SINGLE", splitIntervalDays: null, totalDurationDays: null, followUpDays: 30, isActive: false },
  { name: "하비환", type: "SINGLE", splitIntervalDays: null, totalDurationDays: null, followUpDays: 30, isActive: false },
  {
    name: "킬캡3체험",
    type: "FIXED_SEQUENCE",
    splitIntervalDays: null,
    totalDurationDays: null,
    followUpDays: null,
    isActive: true,
  },
  // 13-x: 탕약/환약 최종 단순화 — 기간 티어 3개(탕약)/2개(환약)만 신규 등록 가능.
  { name: "60포탕약", type: "SPLIT", splitIntervalDays: 14, totalDurationDays: 30, followUpDays: null, isActive: true },
  { name: "탕약1개월", type: "SPLIT", splitIntervalDays: 14, totalDurationDays: 30, followUpDays: null, isActive: true },
  { name: "탕약3개월", type: "SPLIT", splitIntervalDays: 14, totalDurationDays: 90, followUpDays: null, isActive: true },
  { name: "환1개월", type: "SPLIT", splitIntervalDays: 14, totalDurationDays: 30, followUpDays: null, isActive: true },
  { name: "환3개월", type: "SPLIT", splitIntervalDays: 14, totalDurationDays: 90, followUpDays: null, isActive: true },
];

// 킬캡3체험(FIXED_SEQUENCE) 전용 이벤트 시퀀스 — 등록일(startDate) 기준 오프셋.
const trialEventTemplates = [
  { taskType: "TRIAL_WELCOME", offsetDays: 0, generationType: "AI", sortOrder: 0 },
  { taskType: "TRIAL_DAY2", offsetDays: 2, generationType: "AI", sortOrder: 1 },
  { taskType: "TRIAL_DEADLINE", offsetDays: 3, generationType: "AI", sortOrder: 2 },
];

async function main() {
  for (const [index, name] of treatmentCategories.entries()) {
    await prisma.treatmentCategory.upsert({
      where: { name },
      update: {},
      create: { name, sortOrder: index },
    });
  }

  for (const [index, name] of visitTypes.entries()) {
    await prisma.visitType.upsert({
      where: { name },
      update: {},
      create: { name, sortOrder: index },
    });
  }

  for (const { name, role } of staffUsers) {
    await prisma.staffUser.upsert({
      where: { name },
      update: {},
      create: { name, role },
    });
  }

  // 공개 라우트(예: /p/[token] 본상담 예약하기)처럼 로그인한 직원 없이 자동 생성되는
  // WorkTask.creatorId(필수 FK) 전용 계정 — 실사용 "직원"이 아니므로 항상 비활성 상태로
  // 유지해 "현재 사용자" 선택 목록(활성 직원만 노출)에 뜨지 않게 한다.
  await prisma.staffUser.upsert({
    where: { name: "시스템" },
    update: { isActive: false },
    create: { name: "시스템", role: "시스템", isActive: false },
  });

  for (const [index, program] of programs.entries()) {
    await prisma.program.upsert({
      where: { name: program.name },
      // isActive만 재실행 시에도 동기화한다(예: 감비탕/황제감비탕 비활성화) — 그 외 필드는
      // 기존과 동일하게 최초 생성 이후 건드리지 않는다.
      update: { isActive: program.isActive },
      create: { ...program, sortOrder: index },
    });
  }

  const trialProgram = await prisma.program.findUniqueOrThrow({
    where: { name: "킬캡3체험" },
  });
  for (const template of trialEventTemplates) {
    await prisma.programEventTemplate.upsert({
      where: { programId_taskType: { programId: trialProgram.id, taskType: template.taskType } },
      update: {},
      create: { ...template, programId: trialProgram.id },
    });
  }

  console.log("Seed complete.");
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
