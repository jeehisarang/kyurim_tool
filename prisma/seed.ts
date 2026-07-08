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
const programs = [
  { name: "킬팻캡슐", type: "SPLIT", splitIntervalDays: 14, totalDurationDays: 90, followUpDays: null },
  // 13-1: 다이어트(비만치료) 본프로그램은 1개월/3개월 티어로 구분 (체험3일과는 별개, FIXED_SEQUENCE 아님).
  { name: "킬캡1개월", type: "SPLIT", splitIntervalDays: 14, totalDurationDays: 30, followUpDays: null },
  { name: "킬캡3개월", type: "SPLIT", splitIntervalDays: 14, totalDurationDays: 90, followUpDays: null },
  { name: "감비탕", type: "SPLIT", splitIntervalDays: 14, totalDurationDays: 90, followUpDays: null },
  { name: "황제감비탕", type: "SPLIT", splitIntervalDays: 14, totalDurationDays: 90, followUpDays: null },
  { name: "S환", type: "SINGLE", splitIntervalDays: null, totalDurationDays: null, followUpDays: 30 },
  { name: "하비환", type: "SINGLE", splitIntervalDays: null, totalDurationDays: null, followUpDays: 30 },
  {
    name: "킬캡3체험",
    type: "FIXED_SEQUENCE",
    splitIntervalDays: null,
    totalDurationDays: null,
    followUpDays: null,
  },
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

  for (const [index, program] of programs.entries()) {
    await prisma.program.upsert({
      where: { name: program.name },
      update: {},
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
