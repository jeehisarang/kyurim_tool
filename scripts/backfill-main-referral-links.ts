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
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
