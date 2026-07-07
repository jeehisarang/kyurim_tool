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

export type PatientContext = {
  name: string;
  memo: string | null;
  recentVisits: RecentVisit[];
  notes: PatientNoteContext[];
  extraKeywords?: string;
  progressLevel?: ProgressLevel;
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
- 길이는 4~6줄 내외의 한 문단(3회차 톡 제외). "복붙한 느낌"이 나지 않게 문장 속에 자연스럽게 녹여써.
- 아래 "누적 메모"나 "추가 키워드"에 통증 부위·특이사항·주의사항처럼 구체적인 정보가 하나라도 있으면,
  그중 이번 메시지와 가장 관련 있는 것 최소 1가지는 반드시 문장 안에 구체적으로 언급해야 해(절대
  빠뜨리면 안 됨 — 뭉뚱그려 "불편하신 점"처럼 일반화하지 말고 실제 내용을 언급해). 다만 서로 무관하거나
  오래돼 이번 메시지와 상관없는 메모까지 전부 나열하지는 마.
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
위 4가지 중 하나라도 걸리면 반드시 고친 뒤 최종본만 출력해.`;

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

  const userMessage = `환자 정보:
- 이름: ${patient.name}
- 메모(단건): ${patient.memo ?? "없음"}
- 누적 메모(관련 있는 것만 선별해서 반영, 전부 나열 금지):
${noteHistory}
- 최근 내원 이력:
${visitHistory}
${patient.extraKeywords ? `- 이번 발송에만 참고할 추가 키워드: ${patient.extraKeywords}` : ""}
${progressLevel ? `- 호전도: ${progressLevelLabel[progressLevel]}` : ""}

요청: ${MESSAGE_TYPE_PROMPT[messageType]}`;

  return generateMessage(SYSTEM_PROMPT, userMessage);
}

// TODO: 실제 마감설문 링크(13-2/13-3, 구글폼) 전달되면 교체.
const TRIAL_DEADLINE_SURVEY_LINK = "https://forms.gle/PLACEHOLDER-마감설문";

/**
 * 킬팻캡슐 3일체험(13-2) 전용 프롬프트 — 기존 2일차/7일차/3회차톡과 톤이 완전히 달라 섞이지
 * 않게 별도 세트로 분리. 무료체험이라 학술적 설명 대신 "설문 보고 짧게 챙겨봤다"는 인상이 핵심이고,
 * 마감톡은 마감설문 작성 유도가 목적. 환자발송용 + 원장용 내부분석 2단 출력(7-1)이 필요해서
 * JSON 모드로 받는다.
 */
const TRIAL_SYSTEM_PROMPT = `${COMMON_SYSTEM_PROMPT}

[킬팻캡슐 3일체험 전용 지침 — 위 공통 원칙보다 이 지침이 우선한다]
- 이 프로그램은 무료 체험이라 끝까지 안 챙겨 먹는 사람이 많아. 목적은 학술적 설명이 아니라
  "설문을 보고 이 사람만을 위해 짧게 챙겨봤다"는 인상을 주는 것.
- 학술적/의학적 원리 설명, 장황한 배경 설명은 금지. 2~3문장 내외로 짧고 담백하게.
- 마감톡(3일차)의 핵심 목적은 마감설문 작성 유도야. 반드시 마감설문 링크(${TRIAL_DEADLINE_SURVEY_LINK})를
  포함하고, 작성을 자연스럽게 권유하는 문장으로 마무리해.
- 출력은 반드시 아래 JSON 형식 하나만 써:
  {"patientMessage": "...", "internalAnalysis": "..."}
  - patientMessage: 환자에게 그대로 발송할 메시지. 위 공통 원칙(존댓말, 자체검토)을 그대로 적용해.
  - internalAnalysis: 원장님이 상담 전에 참고할 내부 메모. 환자 타입 추정 / 처방 방향 / 상담 시
    짚어줄 포인트를 2~3줄로 간결하게. 환자에게는 절대 노출되지 않으니 존댓말 없이 실무 메모 톤으로 써도 돼.
- JSON 객체 외의 텍스트(설명, 마크다운 코드블록 등)는 절대 출력하지 마.`;

const TRIAL_MESSAGE_TYPE_PROMPT: Record<"TRIAL_DAY2" | "TRIAL_DEADLINE", string> = {
  TRIAL_DAY2:
    "3일체험 시작 2일차에 보내는 중간 체크인 메시지야. 설문 응답 중 이 환자에게 해당하는 " +
    "부분만 골라 짧게 짚어주면서, 잘 챙겨 드시고 계신지 응원하는 톤으로 써줘.",
  TRIAL_DEADLINE:
    "3일체험 마지막 날 보내는 마감 안내 메시지야. 체험 소감을 가볍게 묻고, 마감설문 링크를 " +
    "안내하며 작성을 자연스럽게 유도해줘. 본상담(유료 프로그램) 얘기는 직접적으로 꺼내지 말고, " +
    "설문에 답을 남기면 그걸 보고 맞춤 안내를 드리겠다는 정도로만 부드럽게 언급해.",
};

export type TrialMessageResult = {
  patientMessage: string;
  internalAnalysis: string;
};

export type TrialPatientContext = {
  name: string;
  // Prescription.surveyDataJson 그대로 전달 — 정형 스키마 아님(자유 텍스트 또는 느슨한 JSON).
  // 13-3(구글폼 연동) 적용 시 이 필드에 파싱된 값이 자동으로 채워져도 프롬프트 조립 방식은 그대로 둘 수 있음.
  surveyDataJson: string | null;
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
  taskType: "TRIAL_DAY2" | "TRIAL_DEADLINE",
  patient: TrialPatientContext,
): Promise<TrialMessageResult> {
  const userMessage = `환자 정보:
- 이름: ${patient.name}
- 설문 응답(자유 형식, 없으면 일반적인 톤으로 작성): ${patient.surveyDataJson ?? "없음"}

요청: ${TRIAL_MESSAGE_TYPE_PROMPT[taskType]}`;

  return generateTrialMessageViaModel(TRIAL_SYSTEM_PROMPT, userMessage);
}
