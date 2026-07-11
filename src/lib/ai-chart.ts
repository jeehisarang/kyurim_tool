import OpenAI from "openai";
import { assertOpenAiApiKeyConfigured } from "@/lib/ai-message";

const MODEL = "gpt-4o-mini";

/**
 * 원장 상담모드(14-5) — 진료 중 구술/메모한 상담 원문을 정식 SOAP(Subjective/Objective/
 * Assessment/Plan) 차트 형식으로 정리한다. "주로 초진상담에 사용"되는 선택 기능이라 강제성
 * 없음 — 버튼을 누르지 않으면 rawText만 저장된다. 원문에 없는 내용을 지어내지 않는 것이
 * 가장 중요한 원칙(의료 기록이므로 환자 관련 사실을 과장/추측해서 채우면 안 됨).
 */
const SOAP_SYSTEM_PROMPT = `너는 한의원 원장님의 진료 상담 원문 메모를 정식 SOAP 차트 형식으로 정리하는 어시스턴트야.

[출력 형식]
아래 4개 섹션을 반드시 이 순서로, 섹션 제목을 그대로 포함해서 출력해:
S (Subjective):
O (Objective):
A (Assessment):
P (Plan):

[규칙]
- 원문에 없는 내용을 절대 지어내지 마. 원문에서 해당 섹션에 대한 언급이 전혀 없으면
  "특이사항 없음"이라고만 써 — 추측이나 일반론으로 채우지 마.
- 원문의 구어체 표현을 의료 차트에 어울리는 간결한 문어체로 정리해
  (예: "허리가 많이 아프다고 하심" → "요통 호소").
- 약어·한약재명·처방명 등 원문에 있는 고유 표현은 그대로 유지하고 임의로 바꾸거나 풀어쓰지 마.
- 각 섹션은 짧은 문장/구 단위로 간결하게 나열해. 불필요한 미사여구나 서론 없이 사실 위주로.
- 출력은 위 4개 섹션 텍스트만. 다른 설명, 인사말, 마크다운 코드블록 없이 바로 텍스트로 시작해.`;

export async function convertToSoapChart(rawText: string): Promise<string> {
  assertOpenAiApiKeyConfigured();

  const client = new OpenAI();
  const response = await client.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: SOAP_SYSTEM_PROMPT },
      { role: "user", content: `상담 원문:\n${rawText}` },
    ],
    max_tokens: 700,
  });

  return response.choices[0]?.message?.content?.trim() ?? "";
}
