import { prisma } from "@/lib/db";
import { getProgramCategory } from "@/lib/program-categories";
import { createWithShortToken } from "@/lib/short-token";
import { startOfDay, getSystemStaffUserId } from "@/lib/teaching-pages";
import { saveMissionPhotoImage } from "@/lib/image-upload";
import { getShareBaseUrl } from "@/lib/share-base-url";

const PRESCRIPTION_STATUS_ACTIVE = "ACTIVE";
const KILL_CAP_CATEGORY = "킬팻캡슐";

export const MISSION_TYPE_QUIZ = "QUIZ";
export const MISSION_TYPE_PHOTO = "PHOTO";
export const MISSION_TYPE_TEXT = "TEXT";

const SUBMISSION_STATUS_SENT = "SENT";
const SUBMISSION_STATUS_PENDING_APPROVAL = "PENDING_APPROVAL";
const SUBMISSION_STATUS_AUTO_COMPLETED = "AUTO_COMPLETED";
const SUBMISSION_STATUS_APPROVED = "APPROVED";
const SUBMISSION_STATUS_REJECTED = "REJECTED";

const CREDIT_KIND_MISSION_QUIZ = "MISSION_QUIZ";
const CREDIT_KIND_MISSION_PHOTO = "MISSION_PHOTO";
const CREDIT_KIND_MISSION_TEXT = "MISSION_TEXT";
const CREDIT_STATUS_CONFIRMED = "CONFIRMED";

// 미션톡(14장) 적립 유효기간 — 기존 추천 크레딧(무기한)과 달리 미션 적립만 6개월 후 만료.
const MISSION_CREDIT_EXPIRY_MONTHS = 6;

// 저장 시 환자 메모 타임라인(PatientNote)에도 연결되는 카테고리(task.md) — AI 문구생성이
// 이미 patient.patientNotes를 참조하므로(ai-message.ts PatientNoteContext) 여기서 그냥
// PatientNote를 하나 만들어두면 별도 연동 없이 자동으로 참고재료가 된다.
const PATIENT_NOTE_LINKED_CATEGORIES = ["다짐", "일기"];

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

export class MissionAlreadyProcessedError extends Error {
  constructor() {
    super("이미 처리된 미션입니다.");
    this.name = "MissionAlreadyProcessedError";
  }
}

export class MissionSubmissionNotFoundError extends Error {
  constructor() {
    super("미션을 찾을 수 없습니다.");
    this.name = "MissionSubmissionNotFoundError";
  }
}

export class MissionNotAssignedTodayError extends Error {
  constructor() {
    super("오늘의 미션이 지정되지 않았습니다.");
    this.name = "MissionNotAssignedTodayError";
  }
}

export type KillCapActivePatient = {
  patientId: number;
  patientName: string;
  chartNumber: string;
  programName: string;
};

/**
 * 미션톡(14장) 대상자 조회 — 킬팻캡슐 진행중(status=ACTIVE) 환자만 반환한다(3일체험/1개월/
 * 3개월 전부 포함, program-categories.ts의 카테고리 매핑 재사용). 탕약/환약 등 다른
 * 프로그램만 진행 중인 환자는 제외된다. 한 환자가 킬팻캡슐 처방을 여러 개(예: 체험 후
 * 본프로그램) 동시에 ACTIVE로 갖는 경우는 실사용상 없지만, 혹시 있어도 patientId 기준으로
 * 한 번만 반환한다.
 */
export async function listActiveKillCapPatients(): Promise<KillCapActivePatient[]> {
  const prescriptions = await prisma.prescription.findMany({
    where: { status: PRESCRIPTION_STATUS_ACTIVE },
    include: { patient: true, program: true },
    orderBy: { patient: { name: "asc" } },
  });

  const byPatient = new Map<number, KillCapActivePatient>();
  for (const p of prescriptions) {
    if (getProgramCategory(p.program.name) !== KILL_CAP_CATEGORY) continue;
    if (byPatient.has(p.patientId)) continue;
    byPatient.set(p.patientId, {
      patientId: p.patientId,
      patientName: p.patient.name,
      chartNumber: p.patient.chartNumber,
      programName: p.program.name,
    });
  }

  return [...byPatient.values()];
}

// ── 발송/수행 통계 요약카드 (/missions/today, task2.md) ──────────────────────

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

// stats.ts의 startOfWeekMonday와 동일한 로직(월~일, 서버 로컬시간=KST 기준) — 미션 통계
// 전용이라 이 파일에 그대로 둔다(기존 addMonths처럼 파일별 소규모 날짜 헬퍼 중복 관례).
function startOfWeekMonday(date: Date): Date {
  const day = startOfDay(date);
  const weekday = day.getDay(); // 0=일 ... 6=토
  const diffToMonday = weekday === 0 ? -6 : 1 - weekday;
  return addDays(day, diffToMonday);
}

export function getCurrentWeekRange(): { start: Date; end: Date } {
  const start = startOfWeekMonday(new Date());
  return { start, end: addDays(start, 6) };
}

export type MissionRangeStats = {
  rangeStart: string;
  rangeEnd: string;
  sentCount: number;
  completedCount: number;
  completionRate: number;
};

/**
 * 미션톡 발송/수행 요약(task2.md) — MissionDailyAssignment에는 환자별 발송여부 필드가 없다
 * (하루에 지정되는 미션 템플릿 1개만 나타냄). 실제 "발송" 단위는 MissionSubmission
 * 1건(환자별로 "문구 생성" 시 생성됨, sentAt=생성시각)이고, "수행"은 그중 submittedAt이
 * 채워진(퀴즈 정답 제출/사진·텍스트 제출 — 승인 대기중이어도 포함) 건이다. 두 값 모두
 * 인원수 기준이라 patientId로 dedupe한다(같은 환자가 기간 내 여러 날 발송받아도 1명).
 */
export async function getMissionRangeStats(start: Date, end: Date): Promise<MissionRangeStats> {
  const rangeStart = startOfDay(start);
  const rangeEndExclusive = addDays(startOfDay(end), 1);

  const submissions = await prisma.missionSubmission.findMany({
    where: { missionDailyAssignment: { date: { gte: rangeStart, lt: rangeEndExclusive } } },
    select: { patientId: true, submittedAt: true },
  });

  const sentPatientIds = new Set(submissions.map((s) => s.patientId));
  const completedPatientIds = new Set(
    submissions.filter((s) => s.submittedAt !== null).map((s) => s.patientId),
  );

  const sentCount = sentPatientIds.size;
  const completedCount = completedPatientIds.size;
  const completionRate = sentCount === 0 ? 0 : Math.round((completedCount / sentCount) * 100);

  return {
    rangeStart: rangeStart.toISOString(),
    rangeEnd: startOfDay(end).toISOString(),
    sentCount,
    completedCount,
    completionRate,
  };
}

// ── 미션뱅크 관리 (/settings/missions) ──────────────────────────────────────

export type MissionTemplateInput = {
  type: string;
  category: string;
  title: string;
  body: string;
  quizOptions?: string[];
  quizAnswerIndex?: number;
  rewardAmount: number;
};

export async function listMissionTemplates() {
  return prisma.missionTemplate.findMany({ orderBy: { createdAt: "desc" } });
}

export async function createMissionTemplate(input: MissionTemplateInput) {
  return prisma.missionTemplate.create({
    data: {
      type: input.type,
      category: input.category,
      title: input.title,
      body: input.body,
      quizOptions: input.type === MISSION_TYPE_QUIZ ? JSON.stringify(input.quizOptions ?? []) : null,
      quizAnswerIndex: input.type === MISSION_TYPE_QUIZ ? input.quizAnswerIndex : null,
      rewardAmount: input.rewardAmount,
    },
  });
}

export async function updateMissionTemplate(id: number, input: MissionTemplateInput) {
  return prisma.missionTemplate.update({
    where: { id },
    data: {
      type: input.type,
      category: input.category,
      title: input.title,
      body: input.body,
      quizOptions: input.type === MISSION_TYPE_QUIZ ? JSON.stringify(input.quizOptions ?? []) : null,
      quizAnswerIndex: input.type === MISSION_TYPE_QUIZ ? input.quizAnswerIndex : null,
      rewardAmount: input.rewardAmount,
    },
  });
}

export async function setMissionTemplateActive(id: number, isActive: boolean) {
  return prisma.missionTemplate.update({ where: { id }, data: { isActive } });
}

// ── 발송요일 (/settings/missions/schedule) ──────────────────────────────────

const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];

/**
 * 요일 7개 행이 항상 존재하도록 보장한다(StaffUser "시스템" 계정과 동일한 upsert-on-read
 * 패턴) — 최초 조회 시 없는 요일은 기본값 isActive=true로 채운다.
 */
export async function getMissionSchedule() {
  await Promise.all(
    WEEKDAYS.map((weekday) =>
      prisma.missionSchedule.upsert({
        where: { weekday },
        update: {},
        create: { weekday, isActive: true },
      }),
    ),
  );
  return prisma.missionSchedule.findMany({ orderBy: { weekday: "asc" } });
}

export async function setMissionScheduleDay(weekday: number, isActive: boolean) {
  return prisma.missionSchedule.upsert({
    where: { weekday },
    update: { isActive },
    create: { weekday, isActive },
  });
}

// ── 오늘의 미션 발송 (/missions/today) ──────────────────────────────────────

/**
 * 오늘의 미션 발송 화면 조회 — 템플릿 스냅샷 구조(task.md) 도입 후, submissions는
 * assignment의 "현재" missionTemplateId와 일치하는 것만 내려준다. 그래야 오늘의 미션을
 * 재지정했을 때 이전 템플릿으로 발송했던 이력이 "발송됨"으로 잘못 표시되지 않는다(고아
 * 상태로 남은 이전 템플릿 제출건은 이 화면에서는 안 보이고, DB에는 그대로 보존됨).
 */
export async function getMissionDailyAssignmentForDate(date: Date) {
  const day = startOfDay(date);
  const assignment = await prisma.missionDailyAssignment.findUnique({
    where: { date: day },
    include: { missionTemplate: true, introPhrase: true },
  });
  if (!assignment) return null;

  const submissions = await prisma.missionSubmission.findMany({
    where: { missionDailyAssignmentId: assignment.id, missionTemplateId: assignment.missionTemplateId },
    include: { patient: true },
  });

  return { ...assignment, submissions };
}

/**
 * 서두문구 랜덤 배정(task2.md) — 활성 문구 중에서 뽑되, "직전 발송일"(이 날짜보다 이전인
 * MissionDailyAssignment 중 가장 최근 것)에 쓰인 문구는 제외한다. 활성 문구가 1개뿐이라
 * 직전 문구와 같아질 수밖에 없는 경우엔 예외 없이 그 문구를 그대로 쓴다(선택지가 없으므로).
 */
async function pickRandomIntroPhrase(beforeDate: Date): Promise<number | null> {
  const [activePhrases, previousAssignment] = await Promise.all([
    prisma.missionIntroPhrase.findMany({ where: { isActive: true }, select: { id: true } }),
    prisma.missionDailyAssignment.findFirst({
      where: { date: { lt: beforeDate }, introPhraseId: { not: null } },
      orderBy: { date: "desc" },
      select: { introPhraseId: true },
    }),
  ]);
  if (activePhrases.length === 0) return null;

  const candidates = activePhrases.filter((p) => p.id !== previousAssignment?.introPhraseId);
  const pool = candidates.length > 0 ? candidates : activePhrases;
  return pool[Math.floor(Math.random() * pool.length)].id;
}

export async function upsertMissionDailyAssignment(date: Date, missionTemplateId: number, staffId: number) {
  const day = startOfDay(date);
  const introPhraseId = await pickRandomIntroPhrase(day);
  return prisma.missionDailyAssignment.upsert({
    where: { date: day },
    update: { missionTemplateId, createdByStaffId: staffId, introPhraseId },
    create: { date: day, missionTemplateId, createdByStaffId: staffId, introPhraseId },
  });
}

// 미션톡 고정 타이틀(task3.md) — 서두문구 12종 교체와 함께, "숙제/출석체크" 느낌을 줄이려고
// 인사말과 서두문구 사이에 항상 이 타이틀을 고정으로 끼워넣는다. /m/[token] 공개 페이지
// 상단(MissionSubmissionPage.tsx)에도 같은 문자열을 그대로 노출해야 하므로 값을 바꿀 땐
// 두 곳 다 함께 바꿔야 한다.
export const MISSION_FIXED_TITLE = "🎯 이번 주 규림미션";

// 미션 유형별 카톡 문구 요약 줄(task2.md 지시 문구 그대로 — 퀴즈/사진은 고정 라벨, 텍스트만
// 실제 제목을 쓴다).
function missionSummaryLine(template: { type: string; title: string }): string {
  if (template.type === MISSION_TYPE_QUIZ) return "오늘의 퀴즈";
  if (template.type === MISSION_TYPE_PHOTO) return "체중계 인증";
  return template.title;
}

export type MissionMessageResult = {
  message: string;
  token: string;
  submissionId: number;
  status: string;
};

/**
 * 환자별 발송문구 생성(task2.md) — "문구 생성" 버튼과 "발송 체크"를 하나로 합친다: 오늘
 * 이 환자에 대한 MissionSubmission이 없으면 새로 만들고(=발송 준비 완료, status=SENT),
 * 있으면 기존 토큰을 그대로 재사용해 동일한 문구/링크를 다시 보여준다(재생성 시 토큰이
 * 바뀌지 않아야 한다는 요구사항).
 *
 * 템플릿 스냅샷 구조(task.md) — 조회 키에 assignment의 "현재" missionTemplateId를 반드시
 * 포함한다. 오늘의 미션을 재지정한 뒤 같은 환자에게 다시 "문구 생성"을 누르면, 이전
 * 템플릿으로 만들어졌던 제출건과는 유니크 조합이 달라 자동으로 새 제출건(새 토큰)이
 * 발급된다 — 이전 제출건은 삭제/리셋 없이 그대로 고아 상태로 보존된다(task.md 정책).
 */
export async function getOrCreateMissionMessageForPatient(date: Date, patientId: number): Promise<MissionMessageResult> {
  const day = startOfDay(date);
  const [assignment, patient] = await Promise.all([
    prisma.missionDailyAssignment.findUnique({
      where: { date: day },
      include: { missionTemplate: true, introPhrase: true },
    }),
    prisma.patient.findUniqueOrThrow({ where: { id: patientId } }),
  ]);
  if (!assignment) throw new MissionNotAssignedTodayError();

  let submission = await prisma.missionSubmission.findUnique({
    where: {
      missionDailyAssignmentId_patientId_missionTemplateId: {
        missionDailyAssignmentId: assignment.id,
        patientId,
        missionTemplateId: assignment.missionTemplateId,
      },
    },
  });
  if (!submission) {
    submission = await createWithShortToken((token) =>
      prisma.missionSubmission.create({
        data: {
          missionDailyAssignmentId: assignment.id,
          patientId,
          missionTemplateId: assignment.missionTemplateId,
          token,
          status: SUBMISSION_STATUS_SENT,
        },
      }),
    );
  }

  // 고정 인사말(task.md 발송문구 구조 개선) — 뱅크가 아니라 매번 동일한 문구, 항상 최상단.
  // 4줄이 빈 줄 없이 바로 이어진다(task.md "최종 조합 순서" 명세 그대로).
  const lines = [
    `규림한의원입니다. ${patient.name}님`,
    MISSION_FIXED_TITLE,
    ...(assignment.introPhrase ? [assignment.introPhrase.text] : []),
    missionSummaryLine(assignment.missionTemplate),
    `${getShareBaseUrl()}/m/${submission.token}`,
  ];

  return { message: lines.join("\n"), token: submission.token, submissionId: submission.id, status: submission.status };
}

// ── 미션 제출 페이지 (/m/[token]) ───────────────────────────────────────────

// 템플릿 스냅샷 구조(task.md) — missionTemplate은 assignment의 "현재" 템플릿이 아니라
// submission 자신이 생성 시점에 고정한 템플릿이다. 재지정과 무관하게 이 토큰은 항상
// 자기 원래 유형(퀴즈/사진/텍스트)으로 렌더링돼야 하므로, 여기서 직접 include한다.
export async function getMissionSubmissionByToken(token: string) {
  return prisma.missionSubmission.findUnique({
    where: { token },
    include: {
      patient: true,
      missionTemplate: true,
    },
  });
}

function parseQuizOptions(quizOptions: string | null): string[] {
  if (!quizOptions) return [];
  try {
    const parsed = JSON.parse(quizOptions);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export type QuizSubmitResult = { correct: boolean; quizAttempts: number };

/**
 * QUIZ 제출(task.md) — 정답이면 즉시 AUTO_COMPLETED 확정 + 크레딧 생성. 오답이면
 * quizAttempts만 늘리고 상태는 그대로 둬서 재시도를 허용한다. 이미 확정된 미션에는
 * 재제출을 막는다(중복 적립 방지).
 */
export async function submitMissionQuizAnswer(token: string, selectedIndex: number): Promise<QuizSubmitResult> {
  const submission = await prisma.missionSubmission.findUnique({
    where: { token },
    include: { missionTemplate: true },
  });
  if (!submission) throw new MissionSubmissionNotFoundError();
  if (submission.status !== SUBMISSION_STATUS_SENT) throw new MissionAlreadyProcessedError();

  const template = submission.missionTemplate;
  const correct = selectedIndex === template.quizAnswerIndex;

  if (!correct) {
    const updated = await prisma.missionSubmission.update({
      where: { id: submission.id },
      data: { quizAttempts: { increment: 1 }, quizSelectedIndex: selectedIndex },
    });
    return { correct: false, quizAttempts: updated.quizAttempts };
  }

  const now = new Date();
  const creditEntry = await prisma.referralCreditEntry.create({
    data: {
      patientId: submission.patientId,
      linkToken: `MISSION_${submission.token}`,
      kind: CREDIT_KIND_MISSION_QUIZ,
      amount: template.rewardAmount,
      referredName: template.title,
      status: CREDIT_STATUS_CONFIRMED,
      expiresAt: addMonths(now, MISSION_CREDIT_EXPIRY_MONTHS),
    },
  });
  await prisma.missionSubmission.update({
    where: { id: submission.id },
    data: {
      status: SUBMISSION_STATUS_AUTO_COMPLETED,
      quizSelectedIndex: selectedIndex,
      quizAttempts: { increment: 1 },
      submittedAt: now,
      creditEntryId: creditEntry.id,
    },
  });
  return { correct: true, quizAttempts: submission.quizAttempts + 1 };
}

async function linkPatientNoteIfNeeded(patientId: number, category: string, text: string): Promise<void> {
  if (!PATIENT_NOTE_LINKED_CATEGORIES.includes(category)) return;
  const systemStaffId = await getSystemStaffUserId();
  await prisma.patientNote.create({
    data: { patientId, content: `[미션-${category}] ${text}`, staffUserId: systemStaffId },
  });
}

/**
 * PHOTO 제출(task.md) — 기존 이미지 리사이즈 로직 재사용(saveMissionPhotoImage) 후 경로만
 * 저장, PENDING_APPROVAL로 전환. 이미 처리된(확정/승인/반려) 미션은 재제출을 막는다.
 */
export async function submitMissionPhoto(token: string, file: File) {
  const submission = await prisma.missionSubmission.findUnique({ where: { token } });
  if (!submission) throw new MissionSubmissionNotFoundError();
  if (submission.status !== SUBMISSION_STATUS_SENT) throw new MissionAlreadyProcessedError();

  const { path: photoPath } = await saveMissionPhotoImage(file);
  return prisma.missionSubmission.update({
    where: { id: submission.id },
    data: { status: SUBMISSION_STATUS_PENDING_APPROVAL, submittedPhotoPath: photoPath, submittedAt: new Date() },
  });
}

/**
 * TEXT 제출(task.md) — PENDING_APPROVAL로 전환. 다짐/일기 카테고리는 환자 메모
 * 타임라인(PatientNote)에도 함께 남겨 AI 문구생성이 참고할 수 있게 한다.
 */
export async function submitMissionText(token: string, text: string) {
  const submission = await prisma.missionSubmission.findUnique({
    where: { token },
    include: { missionTemplate: true },
  });
  if (!submission) throw new MissionSubmissionNotFoundError();
  if (submission.status !== SUBMISSION_STATUS_SENT) throw new MissionAlreadyProcessedError();

  const template = submission.missionTemplate;
  await linkPatientNoteIfNeeded(submission.patientId, template.category, text);

  return prisma.missionSubmission.update({
    where: { id: submission.id },
    data: { status: SUBMISSION_STATUS_PENDING_APPROVAL, submittedText: text, submittedAt: new Date() },
  });
}

// ── 승인 대기 큐 (/missions/approvals) ──────────────────────────────────────

export async function listPendingApprovalMissionSubmissions() {
  return prisma.missionSubmission.findMany({
    where: { status: SUBMISSION_STATUS_PENDING_APPROVAL },
    include: { patient: true, missionTemplate: true },
    orderBy: { submittedAt: "asc" },
  });
}

const CREDIT_KIND_BY_MISSION_TYPE: Record<string, string> = {
  [MISSION_TYPE_PHOTO]: CREDIT_KIND_MISSION_PHOTO,
  [MISSION_TYPE_TEXT]: CREDIT_KIND_MISSION_TEXT,
};

export async function approveMissionSubmission(id: number, staffId: number) {
  const submission = await prisma.missionSubmission.findUnique({
    where: { id },
    include: { missionTemplate: true },
  });
  if (!submission) throw new MissionSubmissionNotFoundError();
  if (submission.status !== SUBMISSION_STATUS_PENDING_APPROVAL) throw new MissionAlreadyProcessedError();

  const template = submission.missionTemplate;
  const now = new Date();
  const creditEntry = await prisma.referralCreditEntry.create({
    data: {
      patientId: submission.patientId,
      linkToken: `MISSION_${submission.token}`,
      kind: CREDIT_KIND_BY_MISSION_TYPE[template.type] ?? CREDIT_KIND_MISSION_TEXT,
      amount: template.rewardAmount,
      referredName: template.title,
      status: CREDIT_STATUS_CONFIRMED,
      confirmedByStaffId: staffId,
      expiresAt: addMonths(now, MISSION_CREDIT_EXPIRY_MONTHS),
    },
  });

  return prisma.missionSubmission.update({
    where: { id },
    data: {
      status: SUBMISSION_STATUS_APPROVED,
      approvedByStaffId: staffId,
      approvedAt: now,
      creditEntryId: creditEntry.id,
    },
  });
}

export async function rejectMissionSubmission(id: number, staffId: number) {
  const submission = await prisma.missionSubmission.findUnique({ where: { id } });
  if (!submission) throw new MissionSubmissionNotFoundError();
  if (submission.status !== SUBMISSION_STATUS_PENDING_APPROVAL) throw new MissionAlreadyProcessedError();

  return prisma.missionSubmission.update({
    where: { id },
    data: { status: SUBMISSION_STATUS_REJECTED, approvedByStaffId: staffId, approvedAt: new Date() },
  });
}

export { parseQuizOptions };
