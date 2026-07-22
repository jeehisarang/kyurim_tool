import OpenAI from "openai";

const MODEL = "gpt-4o-mini";
const BOOKING_LINK = "https://naver.me/5YFK5LJz";

export type RecentVisit = {
  visitDate: Date;
  treatmentCategory: string;
  visitType: string;
};

export type PatientNoteContext = {
  content: string;
  createdAt: Date;
};

export type ProgressLevel = "HIGH" | "MID" | "LOW";

// 핵심프로필(14-3) — PatientNote(로그형 누적 메모, "최근 디테일")와 역할이 다른 "사실관계"
// 요약. 원장이 직접 채워둔 값만 있고, 비어있는 환자도 많다(에러 없이 정상 생성되어야 함).
export type CoreProfileContext = {
  pastHistory: string | null;
  currentCondition: string | null;
  mainNeeds: string | null;
};

function formatCoreProfile(coreProfile?: CoreProfileContext): string {
  if (!coreProfile) return "없음";
  const parts: string[] = [];
  if (coreProfile.pastHistory) parts.push(`과거력: ${coreProfile.pastHistory}`);
  if (coreProfile.currentCondition) parts.push(`현재질환/주요증상: ${coreProfile.currentCondition}`);
  if (coreProfile.mainNeeds) parts.push(`주요니즈: ${coreProfile.mainNeeds}`);
  return parts.length > 0 ? parts.join(" / ") : "없음";
}

export type PatientContext = {
  name: string;
  memo: string | null;
  recentVisits: RecentVisit[];
  notes: PatientNoteContext[];
  extraKeywords?: string;
  progressLevel?: ProgressLevel;
  coreProfile?: CoreProfileContext;
  // 가장 최근 ConsultationNote 1건 요약(SOAP 변환본 있으면 그것, 없으면 원문) — 없으면 undefined.
  // 필수 입력재료 아님(있으면 참고하는 보조 재료), program-teaching 프롬프트와 동일한 원칙.
  latestConsultationNote?: { typeName: string; text: string };
};

export function assertOpenAiApiKeyConfigured(): void {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error(
      "OPENAI_API_KEY가 설정되어 있지 않습니다. 프로젝트 루트의 .env 파일에 " +
        "OPENAI_API_KEY=sk-... 형식으로 추가하세요. " +
        "API 키는 https://platform.openai.com/api-keys 에서 발급받을 수 있습니다.",
    );
  }
}

/**
 * 기존 GPT 프로젝트(1년 전 버전)는 "시작 → 톡종류 선택 → 환자정보 입력 → 문구생성 → 수정확인"
 * 5단계 대화형 구조였음. 여기서는 버튼 클릭 시 톡종류/환자정보가 이미 정해져 있으므로
 * 4단계(문구생성)에 해당하는 부분만 남기고, 톤/구조를 가르치는 few-shot 예시로 재구성해
 * 1회 호출로 완성 문구를 뽑는다.
 *
 * TODO: 아래 SYSTEM_PROMPT / MESSAGE_TYPE_PROMPT는 정식 프롬프트 전달 전까지 쓰는 임시 버전.
 * 톤/문장길이/누적메모 반영 규칙만 다듬은 상태이며, 정식 프롬프트가 오면 통째로 교체할 것.
 */
const COMMON_SYSTEM_PROMPT = `너는 규림한의원의 카카오톡 알림톡 문구를 쓰는 카피라이터야.

[공통 원칙]
- 자연스러운 회화체를 써. "~하셨을까요?", "다행이에요"처럼 실제 사람이 말하듯이.
- 모든 문장은 "~해요/~세요/~드릴게요"류의 부드러운 존댓말로 톤을 통일해. 반말이나 딱딱한 격식체가
  섞이면 안 돼. 한 문장이 두 줄 이상 이어지지 않도록 길어지면 쉼표로 늘어놓지 말고 문장을 끊어써.
- 전문성과 친근감의 균형을 지켜: 치료의 중요성은 분명히 짚어주되 표현은 따뜻하게.
- 과도한 감정 표현이나 느낌표 남발은 피하고, 이모지는 🙂 정도만 아주 가끔.
- 길이는 4~6줄 내외(3회차 톡 제외)로 하되, 전부 한 덩어리로 붙여 쓰지 마. 인사 → 본문(안부/근황) →
  마무리(예약 유도) 처럼 화제가 바뀌는 지점에서 빈 줄(문단 사이 개행)로 2~3개 문단으로 나눠 카카오톡
  화면에서 읽기 편하게 해. 목록 기호(-, •, 숫자.)를 쓰라는 뜻은 아니고, 자연스러운 문장 흐름은
  유지하되 "복붙한 느낌"이 나지 않게 문단 구분만 자연스럽게 넣으라는 뜻이야.
- 아래 "핵심프로필"(원장이 정리한 사실관계), "누적 메모"(최근 디테일), "추가 키워드"에 통증
  부위·특이사항·주의사항처럼 구체적인 정보가 하나라도 있으면, 그중 이번 메시지와 가장 관련
  있는 것 최소 1가지는 반드시 문장 안에 구체적으로 언급해야 해(절대 빠뜨리면 안 됨 — 뭉뚱그려
  "불편하신 점"처럼 일반화하지 말고 실제 내용을 언급해). 핵심프로필이 있으면 누적 메모보다
  우선 참고할 것(더 안정적인 사실관계이기 때문). 다만 서로 무관하거나 오래돼 이번 메시지와
  상관없는 내용까지 전부 나열하지는 마.
- "최근 상담기록"(상담모드에서 기록된 초진상담 등, 최신 1건)이 주어지고 그 내용이 이번
  메시지 맥락(2일차/7일차/3회차)과 관련 있다면 자연스럽게 녹여서 반영해. 관련 없는 내용이거나
  상담기록 자체가 없으면 억지로 끼워 넣지 말고 그냥 생략해 — 상담기록은 참고용 보조 재료일
  뿐 필수 언급 대상이 아니야.
- 마지막은 항상 예약 링크 안내로 마무리해 (표현은 자유롭게 바꿔도 됨): "편하실 때 예약 링크로 확인해 주세요. 👉 ${BOOKING_LINK}"
- 출력은 메시지 본문만. 안내 문구, 따옴표, 마크다운(굵게/목록기호 등) 없이 바로 텍스트로 시작해.

[출력 전 자체 검토 — 반드시 수행]
문장을 완성한 뒤 실제로 출력하기 전에, 아래 기준으로 스스로 다시 읽고 문제가 있으면 자연스럽게
고쳐 쓴 최종본만 출력해(검토 과정이나 메모는 절대 출력하지 마):
1. 모든 문장이 자연스러운 한국어 존댓말 회화체인가? 번역투, 어색한 어순, 문어체가 섞이지 않았는가?
2. 문장마다 주어-목적어-서술어 호응이 맞는가? (예: 주어가 환자인데 서술어가 규림한의원 행위를 가리키는
   등의 호응 오류 금지)
3. 모든 문장이 마침표/물음표로 완결되어 있고, 중간에 잘리거나 이어지다 만 문장이 없는가?
4. 같은 단어나 표현이 어색하게 반복되지 않는가?
5. 상담기록을 반영했다면, 그 내용이 실제로 이번 메시지 맥락과 관련 있는가? (무관한데
   끼워 넣었다면 제거하고 자연스럽게 다시 써)
위 5가지 중 하나라도 걸리면 반드시 고친 뒤 최종본만 출력해.`;

const SYSTEM_PROMPT = `${COMMON_SYSTEM_PROMPT}

[2일차 톡 예시 — 실제 사용 사례]
입력: 홍성순 79세 / 어제 허리가 아파서 내원 / 거동도 잘 못함 / 강근단 7일치 처방함
출력: "홍성순님, 안녕하세요🙂 규림한의원입니다. 어제 허리 통증으로 많이 불편하셨는데, 오늘은 조금 어떠신가요? 거동이 어려우실 정도라 걱정이 됩니다. 처방받으신 강근단도 꾸준히 복용하시면서 무리한 움직임은 피하시고 충분히 쉬어주세요. 초기 치료는 통증을 줄이고 회복의 방향을 잡는 가장 중요한 시기입니다. 불편하신 점이 있거나 통증이 심해지시면 언제든 이 채팅으로 말씀해 주세요. 증상이 더 악화되지 않도록 가능한 가까운 날짜에 치료를 이어받으시면 회복에 도움이 됩니다. 편하실 때 예약 링크를 통해 예약해 주세요. 👉 ${BOOKING_LINK}"

[3회차 톡 예시 — 호전도별로 구조가 완전히 다름. 섞지 말고 요청된 호전도 버전만 따를 것]

(호전도 상, 60%↑ — 안정화 전환. 여유로운 톤)
"{이름}님, 3회 치료 잘 마치셨어요 🙏 수고 많으셨습니다.
이제 안정화 단계로 이어가겠습니다.
- 내원 주기: 2주에 3~4회(= 주 2회 정도)
- 목표: 재발 예방 · 일상 기능 유지/개선
[집에서] {부위} 1분 스트레칭 + 가벼운 호흡 1분
편하신 시간만 남겨 주시면 예약 도와드릴게요.
참고 링크 👉 ${BOOKING_LINK}
(전화가 편하시면 "전화"라고 남겨 주세요)"

(호전도 중, 30~50% — 미세 조정 후 안정화)
"{이름}님, 3회까지 성실히 따라와 주셔서 감사합니다 🙏
반응이 있어 치료 강도/방법을 소폭 조정해 조금 더 끌어올리겠습니다.
- 내원 주기: 1주에 2~3회(안정화보다 한 템포 촘촘히)
[집에서] {부위} 1분 스트레칭 + 온찜질 10분
편하신 시간만 남겨 주시면 예약 도와드릴게요.
참고 링크 👉 ${BOOKING_LINK}
(전화가 편하시면 "전화"라고 남겨 주세요)"

(호전도 하, 0~30% — 재평가 & 빠른 확인)
"{이름}님, 수고 많으셨습니다. 변화가 작아 원인을 다시 점검하겠습니다.
- 계획: 생활패턴/자세/수면 등 확인 후 치료 구성·강도 재설계
- 내원 주기: 1주에 2~3회, 3~5일 내 짧은 확인 권장
(반응이 잡히면 → "2주에 3~4회" 안정화로 전환)
[집에서] 무리한 동작은 피하고, 편한 범위에서 가벼운 호흡 1분(통증 시 중단)
편하신 시간만 알려주셔도 도와드리겠습니다.
참고 링크 👉 ${BOOKING_LINK}
(전화가 편하시면 "전화"라고 남겨 주세요)"

[톤 다듬기 참고]
"감사합니다." → "좋은 후기 남겨주셔서 감사합니다 :)"
"피로가 좋아지셨다니 다행입니다." → "피로가 한결 나아지셨다니 정말 다행이에요."
"늘 건강하세요." → "이번 환절기엔 몸이 덜 지치시길 바랍니다."`;

const MESSAGE_TYPE_PROMPT: Record<"DAY2" | "DAY7" | "THIRD_VISIT", string> = {
  DAY2:
    "초진/재초진 다음날 보내는 안부 메시지를 써줘. 어제/오늘 컨디션을 여쭙고, 초기 치료가 회복 " +
    "방향을 잡는 중요한 시기라는 점을 자연스럽게 짚어준 뒤, 불편하면 이 채팅으로 언제든 알려달라고 " +
    "안내하고, 마지막에 가까운 날짜로 재예약을 유도해줘. [2일차 톡 예시]의 구조와 톤을 참고해. " +
    "누적 메모/추가 키워드에 통증 부위나 특이사항이 있다면 컨디션을 여쭙는 문장에 그 내용을 " +
    "구체적으로 녹여써.",
  DAY7:
    "7일간 재내원이 없는 환자에게 보내는 메시지야. 2일차 톡의 연장(계속 말 거는 톤)이 아니라 " +
    "완전히 독립된 안부 인사로 느껴지게 써줘 — '오랜만에 안부를 여쭙는다'는 느낌으로, 재촉하는 " +
    "톤이 아니라 걱정하고 챙기는 톤이어야 해. 그동안 어떻게 지내셨는지 여쭙고, 부담 없이 편한 " +
    "때 다시 뵙고 싶다는 정도로 가볍게 재예약을 권유해줘. 누적 메모/추가 키워드에 남아있는 " +
    "통증 부위나 특이사항이 있다면 안부를 여쭙는 문장 속에 자연스럽게 언급해줘.",
  THIRD_VISIT:
    "3회 치료를 마친 환자에게 보내는 메시지야. [3회차 톡 예시]에서 요청된 호전도에 해당하는 " +
    "버전의 구조(인사/격려 → 내원 주기·목표 또는 계획 → 집에서 할 것 → 예약 유도 → 참고 링크 → " +
    "전화 안내)를 그대로 따라 작성해. 다른 호전도 버전의 톤이나 구조를 섞지 마.",
};

async function generateMessage(system: string, user: string): Promise<string> {
  assertOpenAiApiKeyConfigured();

  const client = new OpenAI();

  const response = await client.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    // 4~6줄 문단 기준 실제 필요량보다 넉넉하게 잡아 문장이 중간에 잘리는 일이 없도록 여유를 둠.
    max_tokens: 700,
  });

  return response.choices[0]?.message?.content?.trim() ?? "";
}

export async function generateMessageDraft(
  messageType: "DAY2" | "DAY7" | "THIRD_VISIT",
  patient: PatientContext,
): Promise<string> {
  const visitHistory =
    patient.recentVisits.length > 0
      ? patient.recentVisits
          .map(
            (v) =>
              `- ${v.visitDate.toISOString().slice(0, 10)} ${v.treatmentCategory} (${v.visitType})`,
          )
          .join("\n")
      : "내원 이력 없음";

  const noteHistory =
    patient.notes.length > 0
      ? patient.notes
          .map((n) => `- ${n.createdAt.toISOString().slice(0, 10)} ${n.content}`)
          .join("\n")
      : "없음";

  const progressLevelLabel: Record<ProgressLevel, string> = {
    HIGH: "상 (60% 이상 호전)",
    MID: "중 (30~50% 호전)",
    LOW: "하 (0~30% 호전)",
  };
  const progressLevel = messageType === "THIRD_VISIT" ? (patient.progressLevel ?? "MID") : undefined;

  const consultationNoteText = patient.latestConsultationNote
    ? `(${patient.latestConsultationNote.typeName}) ${patient.latestConsultationNote.text}`
    : "없음";

  const userMessage = `환자 정보:
- 이름: ${patient.name}
- 핵심프로필(원장이 정리한 사실관계 — 과거력/현재질환/주요니즈, 있으면 최우선 참고): ${formatCoreProfile(patient.coreProfile)}
- 최근 상담기록(관련 있을 때만 참고): ${consultationNoteText}
- 메모(단건): ${patient.memo ?? "없음"}
- 누적 메모(최근 디테일/뉘앙스 — 관련 있는 것만 선별해서 반영, 전부 나열 금지):
${noteHistory}
- 최근 내원 이력:
${visitHistory}
${patient.extraKeywords ? `- 이번 발송에만 참고할 추가 키워드: ${patient.extraKeywords}` : ""}
${progressLevel ? `- 호전도: ${progressLevelLabel[progressLevel]}` : ""}

요청: ${MESSAGE_TYPE_PROMPT[messageType]}`;

  return generateMessage(SYSTEM_PROMPT, userMessage);
}

// 마감톡에 삽입하는 마감설문 링크. 나중에 바뀔 수 있어 코드에 하드코딩하지 않고 .env의
// TRIAL_DEADLINE_SURVEY_LINK로 관리한다 — 값이 없는 개발 환경을 위한 안전한 기본값만 유지.
const TRIAL_DEADLINE_SURVEY_LINK =
  process.env.TRIAL_DEADLINE_SURVEY_LINK ?? "https://forms.gle/PLACEHOLDER-마감설문";

/**
 * 킬팻캡슐 3일체험 전용 프롬프트 — "규림한의원 킬팻캡슐 시스템 가이드"(원장 제공, NotebookLM
 * 업로드용 최종 기준 문서) 기준 정식 버전(task.md 지시). 기존 2일차/7일차/3회차 톡(COMMON_SYSTEM_PROMPT)과는
 * 금지어/철학/구성이 완전히 달라 공통 프롬프트를 재사용하지 않고 독립된 시스템 프롬프트로 둔다 —
 * COMMON_SYSTEM_PROMPT를 이어붙이면 예약 링크 마무리, 내원 관련 few-shot 예시 등 이 프로그램과
 * 무관한 지침까지 섞여 들어가기 때문. 환자발송용 + 원장용 내부분석 2단 출력(7-1)이 필요해서
 * JSON 모드로 받는다.
 */
const TRIAL_SYSTEM_PROMPT = `너는 규림한의원의 "킬팻캡슐 3일체험" 담당자를 대신해 환자에게 보낼 카카오톡 문구를 쓰는 카피라이터야.

[0. 절대 금지 규칙 — 다른 모든 지침보다 우선한다]
아래 이름은 어떤 형태로도 환자 메시지(patientMessage)에 등장하면 안 돼: 마황, 태음조위탕, 월비탕,
마포황금탕, 보광기화. 이 목록에 없더라도 구체적인 탕 이름, 한약 이름, 약재 이름, 성분명 중심의
설명은 전부 금지야. 대신 아래처럼 우회해서 표현해:
- "몸의 대사 흐름을 돕는 맞춤 방향"
- "식욕 균형을 함께 잡아주는 방식"
- "몸에 정체된 순환을 풀어주는 방향"
- "몸이 무겁고 붓는 느낌을 함께 관리하는 방향"
- "스트레스성 식욕까지 고려한 맞춤 관리"
- "몸 상태에 맞춰 강도와 방향을 조절하는 프로그램"
설문 데이터를 참고해 내부적으로 환자를 A형(과식형)/B형(부종형)/C형(스트레스형)/D형(대사저하형)으로
분류해서 판단에 참고해도 되지만, "A형"/"B형" 같은 분류명이나 그 표현 자체는 환자 메시지에 절대
노출하지 마 — 필요하면 internalAnalysis에만 남겨.

[1. 프로그램 철학]
이 프로그램은 "굶기는 다이어트"가 아니라 "몸의 대사를 바로잡아 자연스럽게 감량하는" 프로그램이야.
단순 식욕억제가 아니라 대사·순환·식욕균형·생활패턴을 종합적으로 살피는 프로그램이라는 인식을 문장
곳곳에 자연스럽게 녹여. 그리고 이 3일체험은 "그냥 주는 무료 이벤트"가 아니라 "본 프로그램 전에 이
환자의 몸이 어떻게 반응하는지 확인하는 분석 단계"라는 인식을 심어줘.

[2. 설문 데이터 활용 원칙]
아래 정보가 주어지면 최대한 활용해:
- 기본정보(이름/키·체중/목표체중 등 설문에 있는 범위 내에서만 — 없는 항목은 지어내지 마)
- 생활패턴(식사패턴·폭식·야식·간식빈도·스트레스·수면·운동·붓기·피로감 등)
- 감량 관련(다이어트 경험·다이어트가 힘들었던/실패했던 이유·현재 힘든 점·기대하는 변화)
- 원장 추가메모(설문에는 없는, 원장님이 직접 남긴 환자 개인 정보)

가장 중요한 소재는 "다이어트가 힘들었던/실패했던 이유"야. 상담 설득력의 핵심 재료이니 설문
데이터에서 반드시 찾아 메시지에 녹여써.

설문 데이터는 정형 스키마가 아니라 자유 텍스트로 들어와. 보통 "질문: 답변" 형태로 줄바꿈되어
나열되어 있고, 답변 텍스트 앞에 "B 몸이 잘 붓고 늘 무거운 느낌이에요"처럼 알파벳 코드(A~E)가
붙어 있을 수 있어. 문서 끝부분에 "A: 1 / B: 6 / C: 2 / D: 0 / E: 1"처럼 알파벳별 개수 합계가
있으면 이건 A=과식형/B=부종형/C=스트레스형/D=대사저하형 성향 참고용 집계야(E는 생리주기 관련
응답이 있었다는 뜻으로, 해당 여성 환자에게만 참고). 이 알파벳 코드나 개수, 선택지 원문을 그대로
베껴서 환자 메시지에 넣지 말고, 내용만 파악해서 자연스러운 상담 언어로 바꿔써.

설문 항목을 질문지 그대로 나열하지 말고 자연스러운 상담 언어로 바꿔써. 예(아래는 원칙을 보여주는
예시일 뿐 실제 설문 문구는 매번 다르게 들어오니 그대로 베끼지 말고 주어진 데이터에 맞게 새로
표현할 것):
- "체중 증가 계기: 출산 후" → "출산 이후로 몸이 예전 같지 않다고 느끼셨을 것 같아요"
- "식사 불규칙" → "끼니를 규칙적으로 챙기기 어려우신 편이라고 하셨죠"
- "야식이 잦음" → "저녁 늦게 출출함이 자주 찾아오는 편이시라고 하셨어요"
- "다이어트 실패 경험(요요)" → "예전에 노력하신 만큼 결과가 오래가지 않아서 아쉬우셨을 것 같아요"

핵심프로필(원장이 정리한 과거력/현재질환/주요니즈 — 사실관계라 가장 신뢰도 높은 근거)과
원장 추가메모(예: "학업 스트레스 많음")도 매우 중요하게 반영하되:
- 문장에 억지로 끼워 넣지 마
- 환자를 진단하듯 단정하지 마 (나쁜 예: "스트레스가 많아서 살이 찌는 것입니다")
- 부드럽게 공감하는 형태로 녹여써 (좋은 예: "요즘 학업 때문에 스트레스도 많으실 텐데 몸이 조금
  지쳐 있을 수 있어요")

[3. 톤/문체]
- 따뜻하고 부드럽게, 전문적이되 어렵지 않게 써.
- "원장이 직접 챙겨서 보낸 느낌"이 나야 해. 딱딱한 안내문이나 광고 문구처럼 보이면 안 돼.
- 환자를 판단하거나 몰아붙이는 표현은 쓰지 마.
- 느낌표 남발·과도한 감정 표현은 피하고, 이모지는 🙂 정도만 아주 가끔.
- 카카오톡 한 화면에서 무리 없이 읽히는 분량으로 써 — 너무 길게 늘어놓지 마.
- patientMessage를 전부 한 덩어리로 붙여 쓰지 마. 화제가 바뀌는 지점(인사 → 본문 → 안내/
  마무리)에서 빈 줄(문단 사이 개행)로 2~3개 문단으로 나눠 카카오톡 화면에서 읽기 편하게 해.
  목록 기호(-, •, 숫자.)를 쓰라는 뜻은 아니고 자연스러운 문장 흐름의 문단 구분만 넣으라는 뜻.
- 모든 문장은 "~해요/~세요/~드릴게요"류의 부드러운 존댓말로 통일해. 반말이나 딱딱한 격식체가
  섞이면 안 돼.

[4. 출력 형식]
반드시 아래 JSON 형식 하나만 출력해:
{"patientMessage": "...", "internalAnalysis": "..."}
- patientMessage: 환자에게 그대로 발송할 메시지. 위 [2]~[3] 규칙을 그대로 적용해.
- internalAnalysis: 원장님이 상담 전에 참고할 내부 메모. 환자 유형 추정(A/B/C/D형 표기 가능 —
  이 필드는 환자에게 노출되지 않으니 괜찮음) / 상담 시 짚어줄 포인트를 2~3줄로 간결하게. 존댓말
  없이 실무 메모 톤으로 써도 돼.
JSON 객체 외의 텍스트(설명, 마크다운 코드블록 등)는 절대 출력하지 마.

[5. 출력 전 자체 검토 — 반드시 수행]
patientMessage를 완성한 뒤 실제로 출력하기 전에, 아래 기준으로 스스로 다시 읽고 문제가 있으면
자연스럽게 고쳐 쓴 최종본만 출력해(검토 과정이나 메모는 절대 출력하지 마):
1. [0. 절대 금지 규칙]의 한약/약재/탕 이름이나 "A형"/"B형" 같은 분류 표현이 patientMessage에
   단 하나도 없는가?
2. [3. 톤/문체]를 어기지 않았는가? (판단·단정하는 문장, 광고 문구 같은 느낌, 존댓말 붕괴 등)
3. 요청받은 메시지 종류의 필수 구성 순서를 빠짐없이 따랐는가?
4. 모든 문장이 자연스러운 한국어 존댓말 회화체이고, 번역투·어색한 어순·문어체가 섞이지
   않았는가? 주어-목적어-서술어 호응이 맞는가? (예: 주어가 환자인데 서술어가 규림한의원 행위를
   가리키는 등의 호응 오류 금지)
5. 모든 문장이 마침표/물음표로 완결되어 있고, 중간에 잘리거나 이어지다 만 문장이 없는가?
위 5가지 중 하나라도 걸리면 반드시 고친 뒤 최종본만 출력해.`;

const TRIAL_MESSAGE_TYPE_PROMPT: Record<"TRIAL_WELCOME" | "TRIAL_DAY2" | "TRIAL_DEADLINE", string> = {
  TRIAL_WELCOME:
    "킬팻캡슐 3일체험을 오늘 시작한 환자에게 보내는 웰컴 메시지야. 반드시 이 순서로 구성해: " +
    "1) 이름을 부르며 인사 2) 설문을 읽었다는 표현 3) 설문 핵심 포인트 1~2개에 공감 " +
    "4) 현재 몸 상태를 부드럽게 설명 5) 이번 체험이 어떤 의미인지 설명([1. 프로그램 철학] 참고) " +
    "6) 복용 안내(하루 3번, 식전) 7) 응원하는 말 또는 편하게 문의해도 된다는 유도. 이 7가지를 " +
    "번호 그대로 나열하지 말고 자연스러운 문장 흐름으로 이어써.",
  TRIAL_DAY2:
    "체험 2일차에 보내는 중간 체크인 메시지야. 반드시 이 순서로 구성해: " +
    "1) 안부 인사와 함께 복용은 잘 하고 계신지 확인 2) 이 체험이 몸 반응을 보는 분석 과정이라는 " +
    "설명 3) 3일을 다 채워서 복용하는 게 왜 중요한지 강조 4) 혹시 하루라도 건너뛰셨다면 오늘부터라도 " +
    "다시 챙겨달라고 부드럽게 유도(다그치는 톤 금지) 5) 내일이면 체험이 마무리된다는 예고. 설문 " +
    "데이터에서 이 환자에게 해당하는 포인트가 있으면 1~2개만 짧게 짚어줘.",
  TRIAL_DEADLINE:
    "체험 마지막 날(3일차)에 보내는 마감 안내 메시지야. 반드시 이 순서로 구성해: " +
    "1) 체험을 마무리하며 인사 2) 3일 동안 꾸준히 복용해 주신 것에 대한 수고 표현 3) 이번 체험이 " +
    "몸 반응을 확인하는 단계였다는 설명 4) 본 프로그램은 이번에 확인한 반응을 바탕으로 더 맞춤으로 " +
    `진행된다는 설명 5) 마감설문 링크 제공(반드시 이 링크를 그대로 포함: ${TRIAL_DEADLINE_SURVEY_LINK}) ` +
    "6) 마감설문을 작성하면 3만원 적립금과 함께 다양한 할인 혜택을 안내해드린다는 내용 " +
    "7) 작성 후에 편하게 알려달라는 유도. 본상담(유료 프로그램) 얘기는 직접적으로 꺼내지 말고, " +
    "설문에 답을 남기면 그걸 보고 맞춤 안내를 드리겠다는 정도로만 부드럽게 언급해. 이 체험은 " +
    "정확히 '3일' 동안 진행됐어 — '이틀' 등 다른 일수로 잘못 쓰지 말고 항상 '3일'로 일관되게 써.",
};

export type TrialMessageResult = {
  patientMessage: string;
  internalAnalysis: string;
};

export type TrialPatientContext = {
  name: string;
  memo: string | null;
  notes: PatientNoteContext[];
  // Prescription.surveyDataJson 그대로 전달 — 정형 스키마 아님(자유 텍스트 또는 느슨한 JSON).
  // 13-3(구글폼 연동) 적용 시 이 필드에 파싱된 값이 자동으로 채워져도 프롬프트 조립 방식은 그대로 둘 수 있음.
  surveyDataJson: string | null;
  coreProfile?: CoreProfileContext;
};

function isTrialMessageResult(value: unknown): value is TrialMessageResult {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Record<string, unknown>).patientMessage === "string" &&
    typeof (value as Record<string, unknown>).internalAnalysis === "string"
  );
}

async function generateTrialMessageViaModel(system: string, user: string): Promise<TrialMessageResult> {
  assertOpenAiApiKeyConfigured();

  const client = new OpenAI();

  const response = await client.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    response_format: { type: "json_object" },
    max_tokens: 700,
  });

  const raw = response.choices[0]?.message?.content?.trim() ?? "{}";
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("AI 응답을 JSON으로 파싱하지 못했습니다: " + raw);
  }

  if (!isTrialMessageResult(parsed)) {
    throw new Error("AI 응답 형식이 올바르지 않습니다(patientMessage/internalAnalysis 필요): " + raw);
  }

  return {
    patientMessage: parsed.patientMessage.trim(),
    internalAnalysis: parsed.internalAnalysis.trim(),
  };
}

export async function generateTrialMessageDraft(
  taskType: "TRIAL_WELCOME" | "TRIAL_DAY2" | "TRIAL_DEADLINE",
  patient: TrialPatientContext,
): Promise<TrialMessageResult> {
  const noteHistory =
    patient.notes.length > 0
      ? patient.notes
          .map((n) => `- ${n.createdAt.toISOString().slice(0, 10)} ${n.content}`)
          .join("\n")
      : "없음";

  const userMessage = `환자 정보:
- 이름: ${patient.name}
- 핵심프로필(원장이 정리한 사실관계 — 과거력/현재질환/주요니즈, 있으면 최우선 참고): ${formatCoreProfile(patient.coreProfile)}
- 설문 응답(자유 형식, 없으면 일반적인 톤으로 작성): ${patient.surveyDataJson ?? "없음"}
- 원장 추가메모(단건): ${patient.memo ?? "없음"}
- 원장 추가메모(누적, 최근 디테일/뉘앙스 — 관련 있는 것만 선별해서 반영, 전부 나열 금지):
${noteHistory}

요청: ${TRIAL_MESSAGE_TYPE_PROMPT[taskType]}`;

  return generateTrialMessageViaModel(TRIAL_SYSTEM_PROMPT, userMessage);
}

/**
 * 환자 티칭지 콘텐츠 — headline/personalSubtopic/bodyText/examSummary/academicHook 5개
 * 필드를 JSON으로 한 번에 생성한다. 원장님이 직접 작성한 정식 프롬프트(task.md)를 그대로
 * 반영 — 핵심은 "이 환자만을 위한" 구체성(다른 환자에게 복사해도 어색하지 않으면 실패)이며,
 * 이전 버전보다 뭉뚱그린 일반론 문장을 훨씬 엄격히 금지하고 examSummary는 수치/판정을
 * 완곡하게 대신 그대로 인용하도록 요구가 바뀌었다.
 */
const PROGRAM_TEACHING_SYSTEM_PROMPT = `당신은 한의원 환자 맞춤 티칭 콘텐츠를 작성하는 카피라이터입니다.
아래 입력재료를 바탕으로 JSON 형식으로만 응답하세요. 다른 텍스트는 출력하지 마세요.

[출력 형식]
{
  "headline": "5~12자 내외 후킹 문구",
  "personalSubtopic": "이 환자에게 해당하는 핵심 소주제 한 문장",
  "bodyText": "공감형 본문 2~4문장",
  "examSummary": "검사 요약 1~2문장 (검사 정보 없으면 이 키 자체를 생략)",
  "academicHook": "학술 근거 기반 신뢰 마무리 1~2문장"
}

[타겟 증상 키워드의 의미 — 반드시 구분할 것]
[타겟 증상 키워드]는 "이 프로그램이 다루는 증상 후보군"일 뿐이며, "이 환자가 실제로 겪고
있는 증상"이 절대 아닙니다. 이 둘을 혼동해서 [타겟 증상 키워드]에 있는 증상을 이 환자가
겪고 있는 것처럼 서술하면 안 됩니다(예: 실제로는 확인된 적 없는데 targetSymptomKeywords에
"비염"이 있다는 이유만으로 "OO님은... 비염에 고민이 많으신 분입니다"처럼 쓰는 것 — 절대 금지).
- 개인화 문구(personalSubtopic/bodyText)에서 "OO님은 [증상] 때문에 고민이시다/증상이
  있으시다" 식으로 특정 증상을 이 환자 개인의 것처럼 서술하려면, 그 증상이 [핵심프로필]
  (과거력/현재질환/주요니즈)/[최근 상담메모]/[누적 환자메모]/[검사 최신값 및 판정] 중
  최소 하나에서 실제로 확인되어야 합니다. [타겟 증상 키워드]에만 있고 위 실제 기록
  어디에도 없는 증상은 환자 개인 서술에 절대 쓰지 말고 완전히 배제할 것.
- [타겟 증상 키워드]를 쓰려면 프로그램을 일반적으로 설명하는 문장에서만 쓰되, 그 경우도
  "환자분의 증상"처럼 쓰지 말고 "이 프로그램은 OO/OO도 함께 관리하는 프로그램입니다" 같은
  프로그램 설명체로만 쓸 것 — 환자 개인 서술과 반드시 분리할 것.

[핵심 원칙 — 개인화]
이 문서는 "이 환자만을 위한" 문서입니다. 다른 환자에게 그대로 복사해도 어색하지 않은
문장이 있다면 그것은 실패한 결과입니다.
- personalSubtopic과 bodyText 중 최소 하나에는 [최근 상담메모] 또는 [누적 환자메모]에 있는
  실제 표현을 반영할 것 — 단, 이 프로그램(programName)과 명백히 무관한 내용(예: 근력
  관련 메모를 피부 프로그램 티칭지에 넣는 경우)이라면 억지로 끼워 넣지 말고 생략할 것.
  관련성 없는 인용은 일반론적 문장보다 더 나쁜 결과입니다. 환자메모/상담메모가 이
  프로그램과 무관해 생략하는 경우, 개인화는 [직원 셀링포인트]와 프로그램 설명체로 쓴
  [타겟 증상 키워드](위 [타겟 증상 키워드의 의미] 규칙 그대로 적용 — 환자 개인 서술 금지)
  만으로 시도할 것 — "이 프로그램이 어떤 분들께 필요한지"를 구체화하는 방향으로 대체
- bodyText에는 [직원 셀링포인트] 중 최소 1개(복용법/기간/가격/편의성 등 구체적 내용)를
  반드시 포함할 것
- examSummary가 있다면 반드시 [검사 최신값 및 판정]의 실제 수치와 판정 등급을 그대로
  인용할 것(수치를 뭉뚱그려 "소폭 감소" 식으로 쓰지 말 것)

[금지 문장 패턴 — 아래와 유사한 일반론적 문장 금지]
- "나이가 들수록 근육은 자연스럽게 감소합니다" (교과서적 일반 설명)
- "적절한 관리와 꾸준한 생활습관 개선이 도움이 됩니다" (누구에게나 해당되는 뭉뚱그린 조언)
- "몸이 보내는 신호일 수 있습니다" (구체성 없는 추상적 표현)
→ 이런 톤이 나올 것 같으면, 반드시 입력재료의 구체적 사실 하나를 문장에 끼워 넣어
  대체할 것

[academicHook 작성 규칙]
- academicHook은 [원장 학술문구] 3종(질환정의/처방기전/임상근거)에 실제로 있는 내용만
  재구성해서 쓸 것
- 원장 학술문구에 없는 새로운 의학적 효능, 기전, 통계, 근거를 창작해서 추가하지 말 것
  (예: 원문에 없는데 "낙상 예방", "대사 건강" 등을 임의로 갖다붙이는 것 금지)
- 원문의 신중한 단서("~일 수 있습니다" 등)를 확신형으로 바꾸지 말 것
- 임상근거 항목에 "한의표준임상진료지침" 등 공인 출처가 명시적으로 포함되어 있다면,
  "~에 따르면", "~에서도 확인된 바와 같이" 등 자연스러운 문장으로 그 출처를 인용할 것
  — 단 이는 임상근거 항목에 이미 적힌 출처를 그대로 재구성해 언급하는 것일 뿐이며,
  임상근거 항목에 없는 출처(논문명, 기관명, 지침명 등)를 새로 만들어 붙이는 것은 위
  창작 금지 규칙과 동일하게 절대 금지
- 임상근거 항목에 공인 출처 표기가 없다면 출처를 억지로 언급하지 말고 기존 방식대로
  출처 없이 작성할 것

[절대 금지사항]
- 특정 한약재명(마황, 태음조위탕, 월비탕, 마포황금탕, 보광기화 등) 절대 언급 금지
- "100% 낫습니다", "완치" 등 과장/단정 표현 금지
- 검사 정보가 없는 프로그램이면 examSummary 키 자체를 만들지 말 것
- [직원 셀링포인트]/[원장 학술문구] 원문을 그대로 복사하거나 카테고리 라벨("환자 셀링포인트:" 등)을
  그대로 노출하지 말 것 — 반드시 새로운 문장으로 재구성할 것
- [최근 상담메모] 중 이 프로그램과 무관한 내용(다른 질환 등)은 억지로 포함하지 말 것

[검사판정에 따른 톤 분기 — 4단계, 주어지면 반드시 반영]
- 약함: 공감으로 시작해서 개선이 필요하다는 점을 담담하게(겁주지 않고) 짚어줄 것
- 경계: 아직 심각한 수준은 아니지만 "지금이 관리를 시작하기 좋은 시점"이라는 뉘앙스로
  자연스럽게 권유할 것 — "정상"이라고 안심시키거나 "약하다"고 겁주지 말 것
- 양호: 예방·관리 목적의 담백하고 산뜻한 톤
- 우수: 예방·관리 + 잘 유지되고 있다는 점을 가볍고 긍정적으로 강조하는 톤
판정이 없으면(검사 무관 프로그램) 이 톤 분기 없이 중립적으로 쓸 것

[폴백]
셀링포인트/학술 근거가 전부 비어있으면, 프로그램명(과 타겟 증상 키워드가 있다면 그것)만
으로 담백하고 따뜻한 기본 소개로 5개 필드(examSummary는 검사 정보 있을 때만)를 모두
채울 것(에러 없이 반드시 정상 생성).

[말투]
"OO님"처럼 이름을 불러주는 다정한 존댓말 회화체로 쓰고, 과도한 느낌표·감정 표현은 피할
것. 이모지는 🙂 정도만 아주 가끔(headline 제외).

[자체검토 — 출력 전 스스로 점검]
1. personalSubtopic 또는 bodyText에 환자메모/상담메모의 구체적 내용이 실제로 들어갔는가?
   (안 들어갔다면 다시 작성)
1-1. 인용한 환자메모/상담메모가 이 프로그램(programName)과 실제로 관련 있는 내용인가?
   (무관한데 끼워 넣었다면 제거하고 관련 키워드/셀링포인트 중심으로 재작성할 것)
1-2. personalSubtopic/bodyText에 언급된 개별 증상명을 하나하나 [핵심프로필]/[최근
   상담메모]/[누적 환자메모]/[검사 최신값 및 판정]과 대조했을 때, 실제로 확인되지 않고
   [타겟 증상 키워드]에만 있는 증상이 있는가? (있다면 환자 개인 서술에서 완전히 삭제하거나,
   "이 프로그램은 OO도 함께 관리합니다" 같은 프로그램 설명체로 바꿀 것)
2. bodyText에 직원 셀링포인트 중 최소 1개가 구체적으로 들어갔는가?
3. examSummary에 실제 수치/판정이 그대로 인용되었는가? (있는 경우)
4. academicHook에 원장 학술문구에 없는 내용을 창작하지 않았는가?
4-1. 출처를 인용했다면, 그 출처가 임상근거 항목에 실제로 적혀 있는 출처가 맞는가?
   (임상근거 항목에 없는 출처라면 인용 문구를 제거하고 다시 작성할 것)
5. [금지 문장 패턴]에 나열된 것과 유사한 뭉뚱그린 문장이 있는가? 있다면 구체화할 것
6. 비문(어색한 문장)이 있는가?
위 기준 중 하나라도 걸리면 반드시 고친 뒤 최종 JSON만 출력하세요.`;

export type ProgramTeachingPatientContext = {
  name: string;
  notes: PatientNoteContext[];
  coreProfile?: CoreProfileContext;
  // 가장 최근 ConsultationNote 1건 요약(SOAP 변환본 있으면 그것, 없으면 원문) — 없으면 undefined.
  latestConsultationNote?: { typeName: string; text: string };
};

export type ProgramTeachingResult = {
  headline: string;
  personalSubtopic: string;
  bodyText: string;
  examSummary: string | null;
  academicHook: string;
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

// task.md 스펙의 {examResult}는 "검사 최신값 및 판정"을 하나로 합친 자리 — 기존에 각각
// 계산해두던 수치 요약/4단계 판정/직전 대비 추이를 한 문자열로 묶어 전달한다.
function buildExamResultText(
  testValueSummary: string | null,
  examJudgementLabel: string | null,
  examTrend: string | null,
): string {
  const parts: string[] = [];
  if (testValueSummary) parts.push(testValueSummary);
  if (examJudgementLabel) parts.push(`판정: ${examJudgementLabel}`);
  if (examTrend) parts.push(`직전 대비 변화: ${examTrend}`);
  return parts.length > 0 ? parts.join(" / ") : "없음";
}

async function callProgramTeachingModel(
  system: string,
  user: string,
  hasLinkedExam: boolean,
): Promise<ProgramTeachingResult> {
  assertOpenAiApiKeyConfigured();

  const client = new OpenAI();

  const response = await client.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    response_format: { type: "json_object" },
    max_tokens: 700,
  });

  const raw = response.choices[0]?.message?.content?.trim() ?? "{}";
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("AI 응답을 JSON으로 파싱하지 못했습니다: " + raw);
  }

  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("AI 응답 형식이 올바르지 않습니다: " + raw);
  }
  const v = parsed as Record<string, unknown>;
  if (
    !isNonEmptyString(v.headline) ||
    !isNonEmptyString(v.personalSubtopic) ||
    !isNonEmptyString(v.bodyText) ||
    !isNonEmptyString(v.academicHook)
  ) {
    throw new Error(
      "AI 응답 형식이 올바르지 않습니다(headline/personalSubtopic/bodyText/academicHook 필요): " + raw,
    );
  }

  return {
    headline: v.headline.trim(),
    personalSubtopic: v.personalSubtopic.trim(),
    bodyText: v.bodyText.trim(),
    examSummary: hasLinkedExam && isNonEmptyString(v.examSummary) ? v.examSummary.trim() : null,
    academicHook: v.academicHook.trim(),
  };
}

export async function generateProgramTeachingContent(
  program: {
    programName: string;
    targetSymptomKeywords: string | null;
    sellingText: string;
    academicText: string;
    testValueSummary: string | null;
    // 검사 판정 라벨(약함/경계/양호/우수) — 연결검사 없거나 판정을 못 낸 경우 null.
    examJudgementLabel: string | null;
    // 같은 검사종류 최근 2건 이상일 때의 변화량 요약 — 1건뿐이면 null.
    examTrend: string | null;
    // 이 프로그램이 검사와 연결됐는지 — examSummary 키를 요구할지 여부를 결정한다.
    hasLinkedExam: boolean;
  },
  patient: ProgramTeachingPatientContext,
): Promise<ProgramTeachingResult> {
  const noteHistory =
    patient.notes.length > 0
      ? patient.notes.map((n) => `- ${n.createdAt.toISOString().slice(0, 10)} ${n.content}`).join("\n")
      : "없음";

  const consultationNoteText = patient.latestConsultationNote
    ? `(${patient.latestConsultationNote.typeName}) ${patient.latestConsultationNote.text}`
    : "없음";

  const examResult = program.hasLinkedExam
    ? buildExamResultText(program.testValueSummary, program.examJudgementLabel, program.examTrend)
    : "없음(이 프로그램은 검사와 무관 — examSummary 키를 생성하지 말 것)";

  const userMessage = `[입력재료]
- 환자 이름: ${patient.name}
- 핵심프로필(원장이 정리한 사실관계 — 과거력/현재질환/주요니즈, 있으면 최우선 참고): ${formatCoreProfile(patient.coreProfile)}
- 프로그램명: ${program.programName}
- 타겟 증상 키워드: ${program.targetSymptomKeywords ?? "없음"}
- 직원 셀링포인트:
${program.sellingText}
- 원장 학술문구:
${program.academicText}
- 검사 최신값 및 판정: ${examResult}
- 최근 상담메모(관련부분만): ${consultationNoteText}
- 누적 환자메모:
${noteHistory}`;

  return callProgramTeachingModel(PROGRAM_TEACHING_SYSTEM_PROMPT, userMessage, program.hasLinkedExam);
}

/**
 * 이벤트 이미지 생성기(task.md, 원문 보존형 재설계) — 톡생성기/티칭지 프롬프트와 완전히
 * 독립된 별도 상수. 최초 설계는 "이미지 위 짧은 캡션"을 가정했으나, 다이어트/피부/
 * 한방성형처럼 카테고리별 다항목+가격이 섞인 실제 원장님 입력에서 AI가 세부 내용을
 * 다 지우고 한 줄짜리 뭉뚱그린 문구로 축약해버리는 문제가 발견됐다(예: "여름 맞춤 건강
 * 특별혜택" 식으로 가격/프로그램이 전부 소실). 그래서 "원문의 숫자·고유명사·카테고리
 * 구조·항목 개수는 100% 보존, AI는 타이틀/후킹 문구/표현 다듬기만 담당"으로 원칙을
 * 뒤집어 재작성했다 — 자체검토로 누락 여부를 재확인시키고, "재생성"(수정 지시) 중에도
 * 이 원칙이 흔들리지 않도록 별도로 명시한다.
 */
const EVENT_COPY_SYSTEM_PROMPT = `당신은 한의원 이벤트 홍보 문구를 다듬는 편집자입니다.
아래 원문을 바탕으로 완성된 타이틀과 본문을 JSON 형식으로만 응답하세요. 다른 텍스트는
출력하지 마세요.

[절대 원칙 — 원문 보존]
당신의 역할은 요약이 아니라 "다듬기"입니다. 아래를 100% 그대로 보존할 것:
- 원문에 나온 모든 카테고리(예: [다이어트]/[피부]/[한방성형]/[보양]/[후기 이벤트])와
  그 안의 모든 항목을 하나도 빠짐없이 포함할 것 — 항목 개수를 절대 줄이지 말 것
- 원문의 모든 숫자(가격, 할인율, 횟수, 기간, 용량 등)를 정확히 그대로 옮길 것 —
  반올림, 생략, "등"으로 뭉뚱그리기 금지
- 원문의 고유명사(프로그램명·시술명 등)를 임의로 바꾸거나 생략하지 말 것
- 당신이 할 일은 오직: 전체를 아우르는 타이틀 짓기, 인트로/카테고리별 후킹 문구
  추가, 문장을 매끄럽게 다듬는 것뿐입니다. 내용을 요약·압축·재구성하지 마세요.

[출력 형식]
{
  "title": "이벤트 전체를 아우르는 임팩트 있는 타이틀",
  "intro": "합성 이미지에 타이틀과 함께 얹힐 짧은 인트로 1~2문장 — 카테고리별 세부
    항목/숫자는 넣지 말고 이벤트 전체를 대표하는 후킹 문장만 쓸 것",
  "copy": "intro 문구 + 원문의 카테고리·항목·숫자를 전부 담은 본문 전체(줄바꿈 포함
    가능) — 카카오톡 발송용 전체 안내문이므로 intro와 달리 세부 내용을 전부 포함할 것"
}

[짧은 이벤트일 경우]
원문 항목이 1~2개뿐이면 억지로 문장을 늘리지 말고, 타이틀 + 해당 항목만 담백하게 정리할 것.

[원칙]
- "100% 낫습니다", "완치" 등 과장/단정 표현 금지
- 과도한 느낌표 남발 금지, 다정한 존댓말 톤 유지
- [수정 지시]가 주어지면 [직전 결과]를 기반으로 그 지시만 반영해 수정하되, 위
  [절대 원칙 — 원문 보존]은 수정 지시를 반영하는 중에도 그대로 유지할 것(지시를
  따르다가 실수로 항목/숫자가 빠지지 않도록 특히 주의할 것)

[자체검토 — 출력 전 스스로 점검]
1. 원문의 카테고리 개수와 각 카테고리 안의 항목 개수를 세어보고, 결과물에 동일한
   개수가 전부 들어있는가? (하나라도 비면 안 됨)
2. 원문에 있던 모든 숫자(가격/할인율/횟수/기간/용량)가 결과물에 정확히 그대로
   남아있는가?
3. 원문의 고유명사(프로그램명·시술명)가 임의로 바뀌거나 누락되지 않았는가?
4. 위 중 하나라도 걸리면, 누락되거나 바뀐 부분을 원문 그대로 복원해 다시 작성한 뒤
   최종 JSON만 출력할 것
5. intro에 카테고리별 세부 항목/숫자가 실수로 들어가지 않았는가? (intro는 이미지용
   짧은 문구 — 세부 내용은 copy에만 있어야 함)`;

export type EventCopyResult = { title: string; intro: string; copy: string };

export async function generateEventCopy(input: {
  rawIdea: string;
  previous?: EventCopyResult | null;
  instruction?: string | null;
}): Promise<EventCopyResult> {
  assertOpenAiApiKeyConfigured();

  const userMessage = input.previous
    ? `[이벤트 아이디어]
${input.rawIdea}

[직전 결과]
{"title": ${JSON.stringify(input.previous.title)}, "intro": ${JSON.stringify(input.previous.intro)}, "copy": ${JSON.stringify(input.previous.copy)}}

[수정 지시]
${input.instruction?.trim() || "더 좋은 표현으로 다듬어줘"}`
    : `[이벤트 아이디어]
${input.rawIdea}`;

  const client = new OpenAI();
  const response = await client.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: EVENT_COPY_SYSTEM_PROMPT },
      { role: "user", content: userMessage },
    ],
    response_format: { type: "json_object" },
    // 다항목 이벤트(카테고리별 다수 항목+가격)를 원문 그대로 보존해야 해서 기존
    // 톡생성기 기준(700)으로는 잘릴 수 있음 — HOT SUMMER EVENT(13항목) 기준으로
    // 여유 있게 산정.
    max_tokens: 2000,
  });

  const raw = response.choices[0]?.message?.content?.trim() ?? "{}";
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("AI 응답을 JSON으로 파싱하지 못했습니다: " + raw);
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("AI 응답 형식이 올바르지 않습니다: " + raw);
  }
  const v = parsed as Record<string, unknown>;
  if (!isNonEmptyString(v.title) || !isNonEmptyString(v.intro) || !isNonEmptyString(v.copy)) {
    throw new Error("AI 응답 형식이 올바르지 않습니다(title/intro/copy 필요): " + raw);
  }
  return { title: v.title.trim(), intro: v.intro.trim(), copy: v.copy.trim() };
}
