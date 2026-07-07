import OpenAI from "openai";

const MODEL = "gpt-4o-mini";

// 임시 프롬프트 버전 — 추후 실제 문구 톤/정책이 정해지면 이 상수만 교체하면 됨
const MESSAGE_TYPE_PROMPT: Record<"DAY2" | "DAY7" | "THIRD_VISIT", string> = {
  DAY2: "첫 내원 다음날 점심에 보내는 안부/독려 메시지, 짧고 다정한 톤으로 작성해줘.",
  DAY7: "7일간 미내원한 환자에게 보내는 재방문 유도 메시지, 부담스럽지 않은 톤으로 작성해줘.",
  THIRD_VISIT: "3회 내원 완료를 축하하고 향후 치료 방향을 안내하는 메시지를 작성해줘.",
};

export type RecentVisit = {
  visitDate: Date;
  treatmentCategory: string;
  visitType: string;
};

export type PatientContext = {
  name: string;
  memo: string | null;
  recentVisits: RecentVisit[];
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

async function generateMessage(prompt: string): Promise<string> {
  assertOpenAiApiKeyConfigured();

  const client = new OpenAI();

  const response = await client.chat.completions.create({
    model: MODEL,
    messages: [{ role: "user", content: prompt }],
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

  const userMessage = `환자 정보:
- 이름: ${patient.name}
- 메모: ${patient.memo ?? "없음"}
- 최근 내원 이력:
${visitHistory}

요청: ${MESSAGE_TYPE_PROMPT[messageType]}

출력은 카카오톡에 바로 붙여넣을 수 있는 순수 텍스트로만 작성하고, 마크다운 문법(굵게, 목록 기호 등)은 사용하지 마.`;

  return generateMessage(userMessage);
}
