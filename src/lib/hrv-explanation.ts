import OpenAI from "openai";
import { assertOpenAiApiKeyConfigured } from "@/lib/ai-message";

const MODEL = "gpt-4o-mini";

/**
 * 자율신경맥파기(HRV) 검사 AI 해설 코멘트(task2.md) — exam-explanation.ts의 3원칙(실제
 * 수치 인용 강제/창작 금지/신중한 어조)을 그대로 따르되, 여기는 원장이 작성한 학술 근거
 * (ExamAcademicGuide)가 입력재료로 추가된다 — "재구성만 허용, 새 창작 금지" 원칙이 이
 * 학술 근거 텍스트에 적용된다. 학술 근거가 없으면(원장 미작성) 수치만으로 담백하게 작성.
 */
const HRV_EXPLANATION_SYSTEM_PROMPT = `당신은 한의원에서 환자에게 검사 결과를 설명하는 원장을 돕는 카피라이터입니다.
아래 입력재료(이 환자의 실제 측정값 + 원장이 작성한 학술 근거)를 바탕으로 환자 친화적인 짧은 해설 코멘트를 작성하세요.
다른 텍스트 없이 해설 코멘트 본문만 출력하세요.

[핵심 원칙]
1. 실제 수치 인용 강제 — 혈관건강지수/평균맥박/스트레스지수 등 이 환자의 실제 숫자를
   반드시 하나 이상 그대로 언급할 것
2. 학술 근거는 "재구성"만, "창작" 금지 — [학술 근거]가 주어졌다면 그 내용만 환자 친화적으로
   풀어써서 반영하고, 거기 없는 새로운 의학적 효능/통계/기전을 스스로 만들어내지 말 것.
   [학술 근거]가 "없음"이면 학술적 설명 없이 수치와 추이만으로 담백하게 작성할 것
3. 신중한 어조 유지 — 확언 대신 "~일 수 있습니다", "~에 도움이 될 수 있습니다" 같은 신중한
   표현을 쓸 것. 학술 근거에 이미 신중한 단서가 있다면 임의로 확신형으로 바꾸지 말 것
4. 환자 친화적 어조 — 전문용어는 풀어서 설명하고, 2~4문장 이내로 짧게 쓸 것
5. 수치가 안 좋아 보이는 경우에도 불안 조성 금지 — 있는 그대로 설명하되 다음 단계(재검/
   생활습관 등)로 자연스럽게 이어지는 긍정적 톤을 유지할 것
6. 직전 검사 대비 변화(추이)가 주어졌다면 자연스럽게 반영하되, 없다고 언급하거나 아쉬워
   하지 말 것(첫 검사이거나 변화가 없을 수 있음)

[자체검토 — 출력 전 스스로 점검]
- 이 환자의 실제 수치를 하나 이상 그대로 인용했는가?
- [학술 근거]에 없는 새로운 의학적 효능/통계/진단을 창작하지 않았는가?
- 신중한 어조(~일 수 있습니다)를 유지했는가, 임의로 확신형으로 바꾸지 않았는가?
위 기준에 걸리면 반드시 고친 뒤 최종 코멘트만 출력하세요.`;

export type HrvExplanationInput = {
  vascularHealthIndex: number;
  vascularHealthType: string;
  avgPulse: number;
  stressIndex: number;
  // 직전 검사 대비 변화 요약(getHrvTrend 재사용) — 1건뿐이면 null.
  trend: string | null;
  // 원장 작성 학술 근거(ExamAcademicGuide.content) — 미작성이면 null.
  academicGuide: string | null;
};

function buildUserMessage(input: HrvExplanationInput): string {
  return `[검사 종류] 자율신경맥파기(HRV) 검사
[실제 측정값] 혈관건강지수 ${input.vascularHealthIndex}, 혈관건강도 ${input.vascularHealthType}, 평균맥박 ${input.avgPulse}, 스트레스지수 ${input.stressIndex}
[직전 검사 대비 변화] ${input.trend ?? "없음(첫 검사이거나 변화 없음)"}
[학술 근거] ${input.academicGuide ?? "없음 — 수치만으로 담백하게 작성할 것"}`;
}

// 실패 시 그대로 throw한다 — 호출측(hrv.ts)이 "저장은 반드시 성공" 원칙에 맞춰 try/catch로
// 감싸고 null로 대체하는 책임을 진다(exam-explanation.ts와 동일한 분리 원칙).
export async function generateHrvExplanation(input: HrvExplanationInput): Promise<string> {
  assertOpenAiApiKeyConfigured();
  const client = new OpenAI();

  const response = await client.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: HRV_EXPLANATION_SYSTEM_PROMPT },
      { role: "user", content: buildUserMessage(input) },
    ],
    max_tokens: 200,
  });

  const text = response.choices[0]?.message?.content?.trim();
  if (!text) throw new Error("AI가 빈 응답을 반환했습니다.");
  return text;
}
