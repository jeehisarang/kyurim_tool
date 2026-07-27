/**
 * 기존 진행중 환자 대상 MAIN 추천링크 소급 백필(task2.md, 일회성 스크립트).
 *
 * tier 승격 로직(referrals.ts promoteOrIssueMainReferralLink)은 "본프로그램(1개월/3개월)
 * 치료처방 등록" 이벤트 발생 시점에만 실행되도록 구현되어 있어, 이 기능 배포 이전에 이미
 * 킬팻캡슐 1개월/3개월 프로그램에 등록된 진행중 환자들은 MAIN 링크가 생성되지 않은 채로
 * 남아있다. 이 스크립트로 그 환자들에게 소급 반영한다.
 *
 * "진행중" 판정은 이 앱의 기존 기준을 그대로 재사용한다 — /prescriptions 목록·통계
 * (stats.ts computePrescriptionStats)와 동일하게 Prescription.status === "ACTIVE"만
 * 대상으로 삼는다(STOPPED/COMPLETED는 제외). 만료일은 "처방 등록일 기준"이 아니라
 * "이 스크립트 실행일 기준" +3개월(1개월 프로그램)/+6개월(3개월 프로그램)로 계산한다 —
 * promoteOrIssueMainReferralLink가 실시간 등록 시점에 쓰는 것과 동일한
 * computePromotedLinkExpiry(now, tier) 함수를 그대로 재사용해 로직이 갈라지지 않게 한다.
 *
 * 실행(dry-run, 기본값) — 아무것도 바꾸지 않고 예상 처리 내역만 출력:
 *   npx tsx scripts/backfill-main-referral-links.ts
 *
 * 실행(실제 반영) — 반드시 위 dry-run 결과를 원장님이 확인/승인한 뒤에만 사용:
 *   npx tsx scripts/backfill-main-referral-links.ts --apply
 *
 * --patient 옵션(task2.md) — 처방이 이미 종료(STOPPED)돼 위 기본 동작(ACTIVE만 대상) 대상에서
 * 빠졌지만, 예외적으로 MAIN 추천링크를 만들어주고 싶은 특정 환자 지정용. 새 치료처방을 억지로
 * 등록하는 부작용(스케줄/통계 왜곡) 없이 안전하게 처리하기 위한 것 — 처방 상태와 무관하게 해당
 * 환자의 "가장 최근 본프로그램 처방"을 근거로 tier/링크를 만든다. 본프로그램 이력 자체가 없으면
 * 에러로 안내하고(무엇을 근거로 tier를 정할지 알 수 없으므로) 그 환자는 처리하지 않는다.
 *   npx tsx scripts/backfill-main-referral-links.ts --patient=123
 *   npx tsx scripts/backfill-main-referral-links.ts --patient=123,9152 --apply
 * (쉼표로 구분한 각 값은 환자 ID 또는 차트번호 — 차트번호로 먼저 찾고, 없으면 숫자 ID로 시도)
 */
import "dotenv/config";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../src/generated/prisma/client";
import { createWithShortToken } from "../src/lib/short-token";
import { isMainProgram } from "../src/lib/program-categories";
import {
  getMainProgramDurationTier,
  computePromotedLinkExpiry,
  type MainProgramDurationTier,
} from "../src/lib/referral-config";

const adapter = new PrismaBetterSqlite3({ url: process.env.DATABASE_URL ?? "file:./dev.db" });
const prisma = new PrismaClient({ adapter });

const APPLY = process.argv.includes("--apply");

const PATIENT_ARG = process.argv.find((a) => a.startsWith("--patient="));
const PATIENT_TOKENS = PATIENT_ARG
  ? PATIENT_ARG.slice("--patient=".length)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  : null;

type PlanAction = "PROMOTE" | "ISSUE_NEW" | "SKIP_ALREADY_MAIN";

type PlanEntry = {
  patientId: number;
  patientName: string;
  chartNumber: string;
  programName: string;
  tier: MainProgramDurationTier;
  action: PlanAction;
  existingLinkId: number | null;
  existingToken: string | null;
  sourcePrescriptionId: number;
  // 같은 환자에게 활성 본프로그램 처방이 2건 이상이면(드문 케이스) 가장 최근 등록된
  // 것을 기준으로 tier/만료일을 계산했다는 표시 — dry-run에서 원장님이 검토할 수 있게.
  multiplePrescriptionsNote: string | null;
};

async function buildPlan(): Promise<PlanEntry[]> {
  const activePrescriptions = await prisma.prescription.findMany({
    where: { status: "ACTIVE" },
    include: { program: true, patient: true },
  });

  const mainPrescriptions = activePrescriptions.filter((p) => isMainProgram(p.program));

  // 환자당 활성 본프로그램 처방이 여러 건이면 가장 최근 등록된 것을 기준으로 삼는다
  // (task2.md에 명시된 규칙은 아니지만, 가장 최신 상태를 반영하는 합리적 기본값 —
  // dry-run 출력에서 이 경우를 별도로 표시해 원장님이 확인할 수 있게 한다).
  const byPatient = new Map<number, (typeof mainPrescriptions)[number][]>();
  for (const p of mainPrescriptions) {
    const list = byPatient.get(p.patientId) ?? [];
    list.push(p);
    byPatient.set(p.patientId, list);
  }

  const plan: PlanEntry[] = [];
  for (const list of byPatient.values()) {
    const chosen = list.reduce((latest, p) => (p.createdAt > latest.createdAt ? p : latest));
    const tier = getMainProgramDurationTier(chosen.program.totalDurationDays ?? 90);

    const existingLink = await prisma.referralLink.findFirst({
      where: { patientId: chosen.patientId },
      orderBy: { issuedAt: "desc" },
    });

    const action: PlanAction = !existingLink
      ? "ISSUE_NEW"
      : existingLink.kind === "MAIN"
        ? "SKIP_ALREADY_MAIN"
        : "PROMOTE";

    plan.push({
      patientId: chosen.patientId,
      patientName: chosen.patient.name,
      chartNumber: chosen.patient.chartNumber,
      programName: chosen.program.name,
      tier,
      action,
      existingLinkId: existingLink?.id ?? null,
      existingToken: existingLink?.token ?? null,
      sourcePrescriptionId: chosen.id,
      multiplePrescriptionsNote:
        list.length > 1
          ? `이 환자는 활성 본프로그램 처방이 ${list.length}건 — 가장 최근 등록(#${chosen.id}, ${chosen.program.name}) 기준으로 계산함`
          : null,
    });
  }

  return plan.sort((a, b) => a.patientName.localeCompare(b.patientName, "ko"));
}

type ResolutionError = { token: string; message: string };

// --patient 옵션(task2.md) — 환자ID 또는 차트번호를 받아, 처방 상태(진행중/종료)와 무관하게
// "가장 최근 등록된 본프로그램 처방"을 근거로 tier를 정한다. 본프로그램 이력 자체가 없으면
// (tier를 정할 근거가 없으므로) 에러로 안내하고 그 환자는 계획에서 제외한다.
async function buildPlanForSpecificPatients(
  tokens: string[],
): Promise<{ plan: PlanEntry[]; errors: ResolutionError[] }> {
  const plan: PlanEntry[] = [];
  const errors: ResolutionError[] = [];

  for (const token of tokens) {
    // 차트번호로 먼저 찾고(원장님이 실제로 아는 값), 없으면 숫자면 내부 ID로 시도한다 —
    // 이 시스템의 차트번호도 숫자 문자열일 수 있어 순서를 이렇게 정했다.
    let patient = await prisma.patient.findUnique({ where: { chartNumber: token } });
    if (!patient && /^\d+$/.test(token)) {
      patient = await prisma.patient.findUnique({ where: { id: Number(token) } });
    }
    if (!patient) {
      errors.push({ token, message: `환자를 찾을 수 없습니다(입력값: "${token}")` });
      continue;
    }

    // 처방 상태 무관 — STOPPED/COMPLETED도 포함해서 본프로그램 이력이 있었는지만 확인.
    const allPrescriptions = await prisma.prescription.findMany({
      where: { patientId: patient.id },
      include: { program: true },
    });
    const mainPrescriptions = allPrescriptions.filter((p) => isMainProgram(p.program));

    if (mainPrescriptions.length === 0) {
      errors.push({
        token,
        message: `${patient.name}(${patient.chartNumber}) — 본프로그램 처방 이력이 없어 tier를 정할 수 없습니다`,
      });
      continue;
    }

    const chosen = mainPrescriptions.reduce((latest, p) => (p.createdAt > latest.createdAt ? p : latest));
    const tier = getMainProgramDurationTier(chosen.program.totalDurationDays ?? 90);

    const existingLink = await prisma.referralLink.findFirst({
      where: { patientId: patient.id },
      orderBy: { issuedAt: "desc" },
    });

    const action: PlanAction = !existingLink
      ? "ISSUE_NEW"
      : existingLink.kind === "MAIN"
        ? "SKIP_ALREADY_MAIN"
        : "PROMOTE";

    plan.push({
      patientId: patient.id,
      patientName: patient.name,
      chartNumber: patient.chartNumber,
      programName: chosen.program.name,
      tier,
      action,
      existingLinkId: existingLink?.id ?? null,
      existingToken: existingLink?.token ?? null,
      sourcePrescriptionId: chosen.id,
      multiplePrescriptionsNote:
        `--patient 지정 처리 — 처방상태 무관(현재 상태: ${chosen.status}) 기준 가장 최근 본프로그램 ` +
        `처방(#${chosen.id}, ${chosen.program.name})으로 계산함` +
        (mainPrescriptions.length > 1 ? ` (본프로그램 이력 ${mainPrescriptions.length}건 중 최신)` : ""),
    });
  }

  return { plan, errors };
}

function printPlan(plan: PlanEntry[]) {
  const promote = plan.filter((p) => p.action === "PROMOTE");
  const issueNew = plan.filter((p) => p.action === "ISSUE_NEW");
  const skip = plan.filter((p) => p.action === "SKIP_ALREADY_MAIN");

  console.log(`\n=== 대상 환자 총 ${plan.length}명 ===`);
  console.log(`- 기존 링크 MAIN 승격 대상: ${promote.length}명`);
  console.log(`- 신규 MAIN 링크 발급 대상: ${issueNew.length}명`);
  console.log(`- 이미 MAIN(스킵): ${skip.length}명\n`);

  const actionLabel: Record<PlanAction, string> = {
    PROMOTE: "승격",
    ISSUE_NEW: "신규발급",
    SKIP_ALREADY_MAIN: "스킵(이미 MAIN)",
  };

  for (const entry of plan) {
    console.log(
      `[${actionLabel[entry.action]}] ${entry.patientName}(${entry.chartNumber}) - ${entry.programName} - ` +
        `tier=${entry.tier}${entry.existingToken ? ` - 기존토큰=${entry.existingToken}(${entry.action === "SKIP_ALREADY_MAIN" ? "MAIN" : "TRIAL"})` : " - 기존링크 없음"}`,
    );
    if (entry.multiplePrescriptionsNote) console.log(`    ⚠ ${entry.multiplePrescriptionsNote}`);
  }
}

async function applyPlan(plan: PlanEntry[]) {
  const now = new Date();
  for (const entry of plan) {
    if (entry.action === "SKIP_ALREADY_MAIN") continue;

    const expiresAt = computePromotedLinkExpiry(now, entry.tier);

    if (entry.action === "PROMOTE" && entry.existingLinkId) {
      await prisma.referralLink.update({
        where: { id: entry.existingLinkId },
        data: { kind: "MAIN", expiresAt, isActive: true },
      });
      console.log(
        `[승격 완료] ${entry.patientName}(${entry.chartNumber}) - 토큰 ${entry.existingToken} - ` +
          `만료일 ${expiresAt.toISOString().slice(0, 10)}`,
      );
    } else if (entry.action === "ISSUE_NEW") {
      const link = await createWithShortToken((token) =>
        prisma.referralLink.create({
          data: {
            token,
            patientId: entry.patientId,
            kind: "MAIN",
            sourcePrescriptionId: entry.sourcePrescriptionId,
            expiresAt,
          },
        }),
      );
      console.log(
        `[신규발급 완료] ${entry.patientName}(${entry.chartNumber}) - 토큰 ${link.token} - ` +
          `만료일 ${expiresAt.toISOString().slice(0, 10)}`,
      );
    }
  }
}

async function main() {
  if (PATIENT_TOKENS) {
    console.log(`\n=== --patient 지정 모드 (${PATIENT_TOKENS.join(", ")}) — 처방상태 무관 ===`);
    const { plan, errors } = await buildPlanForSpecificPatients(PATIENT_TOKENS);
    printPlan(plan);

    if (errors.length > 0) {
      console.log(`\n=== 처리 불가 ${errors.length}건 ===`);
      for (const err of errors) console.log(`  ⚠ ${err.token}: ${err.message}`);
    }

    if (!APPLY) {
      console.log("\n(dry-run 모드입니다. 실제 반영하려면 --apply 옵션을 붙여 다시 실행하세요.)");
      return;
    }

    if (errors.length > 0) {
      console.log("\n처리 불가 항목이 있어 --apply를 중단합니다. 위 오류를 확인 후 --patient 목록을 수정해 다시 실행하세요.");
      process.exitCode = 1;
      return;
    }

    console.log("\n--- 실제 반영 시작 ---");
    await applyPlan(plan);
    console.log("\n--- 실제 반영 완료 ---");
    return;
  }

  const plan = await buildPlan();
  printPlan(plan);

  if (!APPLY) {
    console.log("\n(dry-run 모드입니다. 실제 반영하려면 --apply 옵션을 붙여 다시 실행하세요.)");
    return;
  }

  console.log("\n--- 실제 반영 시작 ---");
  await applyPlan(plan);
  console.log("\n--- 실제 반영 완료 ---");
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
