/**
 * 치료처방(Prescription) 가상 시드 — seed-demo.ts로 만든 환자 60명 중 일부를 골라
 * 킬캡3체험/킬캡1개월/킬캡3개월, 감비탕/황제감비탕, 환약(S환/하비환) 처방을 다양한 진행 상태로 채운다.
 * 신규 치료처방 리스트/통계 화면(/prescriptions)이 실데이터 입력 전에도 확인 가능하도록 하는 목적.
 *
 * 실행: npx tsx prisma/seed-prescriptions.ts  (또는 npm run db:seed-prescriptions)
 *
 * seed-demo.ts의 DEMO_MARKER 붙은 환자만 대상으로 하며, 실제 사용자가 등록한 처방(예: 김우석)은
 * 건드리지 않는다. 이미 데모 환자에게 처방이 하나라도 있으면 재실행을 막는다(seed-demo.ts와 동일 패턴).
 */
import "dotenv/config";
import { prisma } from "../src/lib/db";
import { createPrescription, completeTodoTask } from "../src/lib/prescriptions";
import { confirmProgramEvent } from "../src/lib/program-events";

const DEMO_MARKER = "[데모 시드 데이터]";

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 이미 완료 처리된(다음 라운드가 없는) 라운드까지 completeTodoTask를 반복 호출해 차수를 미리 진행시킨다. */
async function advanceRounds(prescriptionId: number, times: number, staffUserId: number) {
  for (let i = 0; i < times; i++) {
    const task = await prisma.todoTask.findFirst({
      where: { prescriptionId, isDone: false },
      orderBy: { dueDate: "asc" },
    });
    if (!task) break;
    await completeTodoTask(task.id, staffUserId);
  }
}

/** FIXED_SEQUENCE(킬캡3체험) 이벤트를 dueDate 순으로 count개만큼 발송확인 처리. */
async function completeTrialEvents(prescriptionId: number, count: number, staffUserId: number) {
  const tasks = await prisma.todoTask.findMany({
    where: { prescriptionId },
    orderBy: { dueDate: "asc" },
  });
  for (let i = 0; i < count && i < tasks.length; i++) {
    await confirmProgramEvent({
      todoTaskId: tasks[i].id,
      staffUserId,
      patientMessage: `${DEMO_MARKER} 데모 발송 문구`,
      internalAnalysis: `${DEMO_MARKER} 데모 내부 메모`,
    });
  }
}

async function main() {
  const alreadySeeded = await prisma.prescription.count({
    where: { patient: { memo: { contains: DEMO_MARKER } } },
  });
  if (alreadySeeded > 0) {
    console.log(
      `이미 데모 환자에게 치료처방이 시드된 상태입니다 (${alreadySeeded}건 존재). ` +
        "중복 생성을 막기 위해 스크립트를 종료합니다.",
    );
    return;
  }

  const demoPatients = await prisma.patient.findMany({
    where: { memo: { contains: DEMO_MARKER } },
  });
  if (demoPatients.length === 0) {
    console.log("데모 환자가 없습니다. 먼저 npm run db:seed-demo를 실행하세요.");
    return;
  }

  const staffUsers = await prisma.staffUser.findMany();
  const programs = await prisma.program.findMany();
  const programByName = new Map(programs.map((p) => [p.name, p]));
  const pickStaff = () => staffUsers[Math.floor(Math.random() * staffUsers.length)];

  const shuffled = shuffle(demoPatients);
  let cursor = 0;
  function takePatients(count: number): typeof demoPatients {
    const slice = shuffled.slice(cursor, cursor + count);
    cursor += count;
    return slice;
  }

  let createdCount = 0;

  // --- 1. 킬캡3체험: 6명 (등록만 2명 / 웰컴만 발송 2명 / 마감까지 완료 2명) ---
  const trialProgram = programByName.get("킬캡3체험")!;
  const trialPatients = takePatients(6);
  for (const [i, patient] of trialPatients.entries()) {
    const staff = pickStaff();
    const prescription = await createPrescription({
      patientId: patient.id,
      programId: trialProgram.id,
      staffUserId: staff.id,
      startDate: new Date(),
      surveyDataJson: JSON.stringify({ weight: 60 + i * 3, goal: `${2 + (i % 3)}kg 감량` }),
    });
    createdCount += 1;
    const completedEvents = i < 2 ? 0 : i < 4 ? 1 : 3; // 0=등록만, 1=웰컴만, 3=마감까지 완료
    if (completedEvents > 0) await completeTrialEvents(prescription.id, completedEvents, staff.id);
  }

  // --- 2. 킬캡1개월: 4명, 서로 다른 차수 ---
  const oneMonthProgram = programByName.get("킬캡1개월")!;
  const oneMonthPatients = takePatients(4);
  const oneMonthRounds = [0, 1, 2, 3]; // 진행 라운드 수(0=1차 그대로)
  for (const [i, patient] of oneMonthPatients.entries()) {
    const staff = pickStaff();
    const prescription = await createPrescription({
      patientId: patient.id,
      programId: oneMonthProgram.id,
      staffUserId: staff.id,
      startDate: new Date(),
    });
    createdCount += 1;
    await advanceRounds(prescription.id, oneMonthRounds[i], staff.id);
  }

  // --- 3. 킬캡3개월: 4명, 서로 다른 차수(더 넓게 분산) ---
  const threeMonthProgram = programByName.get("킬캡3개월")!;
  const threeMonthPatients = takePatients(4);
  const threeMonthRounds = [0, 2, 4, 6];
  for (const [i, patient] of threeMonthPatients.entries()) {
    const staff = pickStaff();
    const prescription = await createPrescription({
      patientId: patient.id,
      programId: threeMonthProgram.id,
      staffUserId: staff.id,
      startDate: new Date(),
    });
    createdCount += 1;
    await advanceRounds(prescription.id, threeMonthRounds[i], staff.id);
  }

  // --- 4. 감비탕: 4명 ---
  const gambitangProgram = programByName.get("감비탕")!;
  const gambitangPatients = takePatients(4);
  const gambitangRounds = [0, 1, 2, 3];
  for (const [i, patient] of gambitangPatients.entries()) {
    const staff = pickStaff();
    const prescription = await createPrescription({
      patientId: patient.id,
      programId: gambitangProgram.id,
      staffUserId: staff.id,
      startDate: new Date(),
    });
    createdCount += 1;
    await advanceRounds(prescription.id, gambitangRounds[i], staff.id);
  }

  // --- 5. 황제감비탕: 3명 ---
  const royalGambitangProgram = programByName.get("황제감비탕")!;
  const royalGambitangPatients = takePatients(3);
  const royalGambitangRounds = [0, 1, 2];
  for (const [i, patient] of royalGambitangPatients.entries()) {
    const staff = pickStaff();
    const prescription = await createPrescription({
      patientId: patient.id,
      programId: royalGambitangProgram.id,
      staffUserId: staff.id,
      startDate: new Date(),
    });
    createdCount += 1;
    await advanceRounds(prescription.id, royalGambitangRounds[i], staff.id);
  }

  // --- 6. 환약(S환/하비환): 각 프로그램당 이번엔 신규 환자 없이, 중복등록 환자 목록에서 함께 배정 ---
  const pillProgram1 = programByName.get("S환")!;
  const pillProgram2 = programByName.get("하비환")!;
  const pillPatients = takePatients(3); // 1명은 S환 완료, 1명은 S환 진행중, 1명은 하비환 진행중
  {
    const staff = pickStaff();
    const p1 = await createPrescription({
      patientId: pillPatients[0].id,
      programId: pillProgram1.id,
      staffUserId: staff.id,
      startDate: new Date(),
    });
    createdCount += 1;
    await advanceRounds(p1.id, 1, staff.id); // SINGLE은 1회 완료 처리 시 COMPLETED

    await createPrescription({
      patientId: pillPatients[1].id,
      programId: pillProgram1.id,
      staffUserId: staff.id,
      startDate: new Date(),
    });
    createdCount += 1;

    await createPrescription({
      patientId: pillPatients[2].id,
      programId: pillProgram2.id,
      staffUserId: staff.id,
      startDate: new Date(),
    });
    createdCount += 1;
  }

  // --- 7. 중복 등록 케이스 3명: 이미 만든 환자 중 일부에게 추가 프로그램을 하나 더 등록 ---
  const duplicateCases: { patient: (typeof demoPatients)[number]; programId: number }[] = [
    { patient: trialPatients[0], programId: gambitangProgram.id }, // 3일체험 + 감비탕
    { patient: oneMonthPatients[0], programId: pillProgram2.id }, // 킬팻 1개월 + 하비환
    { patient: threeMonthPatients[0], programId: royalGambitangProgram.id }, // 킬팻 3개월 + 황제감비탕
  ];
  for (const { patient, programId } of duplicateCases) {
    const staff = pickStaff();
    await createPrescription({
      patientId: patient.id,
      programId,
      staffUserId: staff.id,
      startDate: new Date(),
    });
    createdCount += 1;
  }

  console.log(`치료처방 시드 완료: 처방 ${createdCount}건 생성 (중복 등록 3명 포함).`);
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
