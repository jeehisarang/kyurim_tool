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

// 미션톡(14장) 퀴즈 미션 템플릿 10개(task.md 퀴즈미션 10개 시드 반영) — placeholder 3건
// ("다이어트 상식 퀴즈 1/2/3")을 실제 문항으로 교체하고 나머지 7개를 추가한다. title로
// 존재 여부를 확인해 재실행해도 중복 생성되지 않게 한다(MissionTemplate은 별도 unique
// 필드가 없어 findFirst로 대신 dedup).
const OLD_PLACEHOLDER_QUIZ_TITLES = ["다이어트 상식 퀴즈 1", "다이어트 상식 퀴즈 2", "다이어트 상식 퀴즈 3"];

const quizMissionTemplates = [
  {
    title: "밥은 천천히",
    body: "밥을 천천히 먹어야 하는 이유, 뇌가 \"배부르다\"는 신호를 받기까지 걸리는 시간은?",
    quizOptions: ["5분", "20분", "1시간", "3시간"],
    quizAnswerIndex: 1,
  },
  {
    title: "포만감 오래가는 밥",
    body: "다음 중 식이섬유가 가장 풍부해서 포만감이 오래가는 건?",
    quizOptions: ["흰쌀밥", "현미", "라면", "케이크"],
    quizAnswerIndex: 1,
  },
  {
    title: "단백질 최고봉",
    body: "다음 중 단백질 함량이 가장 높은 식품은?",
    quizOptions: ["닭가슴살", "사과", "감자", "흰쌀밥"],
    quizAnswerIndex: 0,
  },
  {
    title: "야식이 안 좋은 이유",
    body: "야식이 다이어트에 특히 안 좋은 이유는?",
    quizOptions: [
      "밤엔 소화효소가 안 나와서",
      "자는 동안 활동량이 적어 칼로리 소모가 줄어서",
      "밤에 먹으면 위가 커져서",
      "특별한 이유 없음",
    ],
    quizAnswerIndex: 1,
  },
  {
    title: "스트레스와 단 음식",
    body: "스트레스를 받으면 코르티솔이라는 호르몬이 늘어나는데, 이때 생기는 대표적 변화는?",
    quizOptions: ["식욕이 준다", "특히 단 음식이 당긴다", "물이 당긴다", "아무 변화 없다"],
    quizAnswerIndex: 1,
  },
  {
    title: "액체 칼로리의 함정",
    body: "콜라 같은 단 음료가 다이어트에 안 좋은 이유 중 하나는?",
    quizOptions: [
      "칼로리가 없어서",
      "액체 칼로리는 배부름을 잘 못 느끼게 해서",
      "카페인 때문에",
      "색소 때문에",
    ],
    quizAnswerIndex: 1,
  },
  {
    title: "근육과 기초대사량",
    body: "근육량이 많으면 다이어트에 유리한 이유는?",
    quizOptions: [
      "운동을 덜 해도 돼서",
      "가만히 있어도 기초대사량이 높아 칼로리를 더 쓰기 때문",
      "물을 덜 마셔도 돼서",
      "상관없음",
    ],
    quizAnswerIndex: 1,
  },
  {
    title: "식전 물 한 컵",
    body: "식사 전에 물 한 컵을 미리 마시면 생기는 효과는?",
    quizOptions: ["포만감이 줄어든다", "포만감이 늘어 식사량이 줄어든다", "소화가 느려진다", "변화 없다"],
    quizAnswerIndex: 1,
  },
  {
    title: "근력운동과 요요",
    body: "다이어트 중에도 근력운동을 같이 해야 하는 이유는?",
    quizOptions: ["살이 더 잘 찐다", "근육 손실을 막아 요요가 덜 온다", "식욕이 늘어난다", "상관없음"],
    quizAnswerIndex: 1,
  },
  {
    title: "천천히 오르는 혈당",
    body: "다음 중 혈당을 천천히 올려 배고픔이 늦게 오게 해주는 식품은?",
    quizOptions: ["흰빵", "사탕", "렌틸콩(콩류)", "탄산음료"],
    quizAnswerIndex: 2,
  },
];

// 미션톡 사진/텍스트 미션 템플릿 7개(task.md 사진/텍스트 미션 템플릿 7개 시드 반영) — 퀴즈
// 10건에 이어 신규 추가(기존 퀴즈는 그대로 유지). "다짐"/"일기" 카테고리는 제출 시 환자 메모
// 타임라인에 자동 연결된다(missions.ts linkPatientNoteIfNeeded, 이전 지시서에서 이미 구현).
const photoAndTextMissionTemplates = [
  { type: "PHOTO", category: "체중계", title: "체중계 인증", body: "오늘 체중계 위에 선 모습을 사진으로 올려주세요.", rewardAmount: 2000 },
  { type: "PHOTO", category: "식단", title: "오늘 한 끼 인증", body: "오늘 드신 한 끼, 사진으로 가볍게 남겨주세요.", rewardAmount: 1500 },
  { type: "PHOTO", category: "운동", title: "움직인 순간 인증", body: "오늘 걷거나 움직인 순간을 사진 한 장으로 남겨주세요.", rewardAmount: 1500 },
  { type: "TEXT", category: "다짐", title: "다이어트를 시작한 이유", body: "다이어트를 시작하게 된 이유나 이루고 싶은 모습을 적어주세요.", rewardAmount: 2000 },
  { type: "TEXT", category: "일기", title: "오늘 하루 소감", body: "오늘 하루 어떠셨는지, 짧게라도 남겨주세요.", rewardAmount: 2000 },
  { type: "TEXT", category: "후기", title: "캡슐 복용 후기", body: "캡슐 드시면서 느낀 점을 편하게 적어주세요.", rewardAmount: 5000 },
  { type: "TEXT", category: "다짐", title: "힘들었던 순간", body: "관리하면서 제일 힘들었던 순간, 어떻게 이겨내셨는지 적어주세요.", rewardAmount: 2000 },
];

// 미션톡 서두문구 뱅크(task3.md 타이틀 고정+문구 개편 — 6종 → 12종 교체).
// 이번엔 실사용 발송 이력이 있는 데이터라(MissionDailyAssignment.introPhraseId로 참조됨)
// 하드 삭제하지 않고 isActive=false로 소프트 비활성화만 한다(소프트삭제 원칙).
const PREVIOUS_INTRO_PHRASES_TO_DEACTIVATE = [
  "혼자 하시면 지치기 쉬워서, 저희가 종종 이렇게 가볍게 챙겨드리는 미션이에요. 부담은 없어요.",
  "다이어트는 꾸준함이 관건이라 종종 이런 미션으로 챙겨드리고 있어요. 안 하셔도 그만이에요.",
  "혼자 버티지 마시라고 저희가 가끔 이렇게 미션을 드려요. 3초면 끝나요.",
  "잘 하고 계신지 종종 확인차 미션 하나 준비했어요. 부담 갖지 마세요.",
  "중간에 힘 빠지지 않으시라고, 저희가 주기적으로 이렇게 챙겨드리는 거예요.",
  "혼자 하면 루즈해지기 쉬워서, 저희가 가끔 이런 미션으로 리마인드 드려요.",
];

const missionIntroPhrases = [
  "이번 주도 작은 미션 하나 준비했습니다.\n필수는 아닙니다.\n편하실 때 1분만 참여하시면 되고,\n참여하신 분께는 적립금도 드립니다.\n이번 주 미션이 궁금하시다면 눌러보세요. 😊",
  "다이어트는\n거창한 결심보다 작은 실천이 오래갑니다.\n그래서 이번 주도\n부담 없는 1분 미션을 준비했습니다.\n참여하시면 적립금도 함께 드려요.",
  "이번 주 미션도\n생각보다 훨씬 간단합니다.\n안 하셔도 괜찮지만,\n참여하시면 적립금까지 챙기실 수 있어요.\n가볍게 한번 확인해 보세요.",
  "혼자 다이어트를 하다 보면\n가끔 동기부여가 필요하죠.\n그래서 준비한\n이번 주 작은 미션입니다.\n1분이면 충분합니다.",
  "이번 주도\n소소한 미션이 도착했습니다.\n부담은 내려놓고,\n편하실 때 가볍게 참여해 보세요.\n적립금도 함께 준비되어 있습니다.",
  "오늘도 열심히 하고 계신 여러분께\n작은 미션 하나 보내드립니다.\n안 하셔도 괜찮습니다.\n하지만 작은 실천 하나가\n생각보다 큰 변화를 만들기도 합니다.",
  "이번 주 미션은\n1분이면 충분합니다.\n커피 한 잔 마시는 시간보다 짧지만,\n꾸준함에는 큰 도움이 될 수 있습니다.\n참여하시면 적립금도 받아가세요.",
  "이번 주도\n가볍게 즐기는 미션 하나!\n의무도,\n출석체크도 아닙니다.\n편하게 참여하시고\n적립금도 받아가세요.",
  "혹시 이번 주도\n잘 지내고 계신가요? 😊\n가볍게 참여할 수 있는\n이번 주 미션을 준비했습니다.\n시간 되실 때 한번 확인해 보세요.",
  "이번 주도\n건강한 습관 하나를 더해볼까요?\n1분이면 끝나는 미션으로\n적립금도 함께 챙겨가세요.",
  "\"이번 주는 어떤 미션이지?\"\n그 궁금함 하나면 충분합니다. 😊\n이번에도 부담 없이 참여하실 수 있는\n작은 미션을 준비했습니다.",
  "이번 주도\n작은 선물을 준비했습니다.\n1분 미션에 참여하시고,\n적립금도 함께 받아가세요.\n안 하셔도 괜찮지만,\n하면 조금 더 재미있는 다이어트가 됩니다.",
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

  // 공개 라우트(예: /p/[token] 프로그램문의하기)처럼 로그인한 직원 없이 자동 생성되는
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

  // placeholder 3건 교체(task.md 퀴즈미션 10개 시드 반영) — 실제 사용 이력(발송/제출)이
  // 없는 초기 예시 데이터라 안전하게 삭제 후 아래 10개로 다시 채운다.
  await prisma.missionTemplate.deleteMany({ where: { title: { in: OLD_PLACEHOLDER_QUIZ_TITLES } } });

  for (const template of quizMissionTemplates) {
    const existing = await prisma.missionTemplate.findFirst({ where: { title: template.title } });
    if (existing) continue;
    await prisma.missionTemplate.create({
      data: {
        type: "QUIZ",
        category: "퀴즈",
        title: template.title,
        body: template.body,
        quizOptions: JSON.stringify(template.quizOptions),
        quizAnswerIndex: template.quizAnswerIndex,
        rewardAmount: 1000,
      },
    });
  }

  for (const template of photoAndTextMissionTemplates) {
    const existing = await prisma.missionTemplate.findFirst({ where: { title: template.title } });
    if (existing) continue;
    await prisma.missionTemplate.create({ data: { ...template, isActive: true } });
  }

  // 서두문구 뱅크 6종 → 12종 교체(task3.md) — 이번엔 실사용 발송 이력이 있어 하드 삭제
  // 대신 isActive=false로만 비활성화한다(MissionDailyAssignment.introPhraseId 참조와
  // 과거 발송 이력 감사추적을 그대로 보존).
  await prisma.missionIntroPhrase.updateMany({
    where: { text: { in: PREVIOUS_INTRO_PHRASES_TO_DEACTIVATE } },
    data: { isActive: false },
  });

  for (const text of missionIntroPhrases) {
    const existing = await prisma.missionIntroPhrase.findFirst({ where: { text } });
    if (existing) continue;
    await prisma.missionIntroPhrase.create({ data: { text } });
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
