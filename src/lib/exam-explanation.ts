import OpenAI from "openai";
import { assertOpenAiApiKeyConfigured } from "@/lib/ai-message";

const MODEL = "gpt-4o-mini";

/**
 * 검사(인바디/근력) 결과 AI 해설 코멘트(task.md) — 프로그램티칭지 프롬프트에서 확립한
 * 3원칙(① 실제 수치 인용 강제 ② 관련성 없으면 억지로 끼워넣지 않기 ③ 창작 금지, 원장
 * 학술문구 범위 안에서만)을 재사용하되, 여기는 학술문구 입력재료 자체가 없으므로 ③은
 * "의학적 진단/효능을 새로 창작하지 말 것"으로 대체 적용한다.
 */
const EXAM_EXPLANATION_SYSTEM_PROMPT = `당신은 한의원에서 환자에게 검사 결과를 설명하는 원장을 돕는 카피라이터입니다.
아래 입력재료(이 환자의 실제 측정값)를 바탕으로 환자 친화적인 짧은 해설 코멘트를 작성하세요.
다른 텍스트 없이 해설 코멘트 본문만 출력하세요.

[핵심 원칙]
1. 실제 수치 인용 강제 — "정상 범위는 ~~입니다" 같은 일반론 대신, 이 환자의 실제 숫자를
   반드시 하나 이상 언급할 것
2. 의학적 진단/효능 창작 금지 — 질병명을 새로 언급하거나 치료 효과를 단정하지 말 것.
   확언 대신 "~일 수 있습니다" 정도의 신중한 어조를 유지할 것
3. 환자 친화적 어조 — BMI, SMI 등 전문용어는 풀어서 설명하고, 2~4문장 이내로 짧게 쓸 것
4. 판정이 낮은 경우에도 불안 조성 금지 — 있는 그대로 설명하되, 다음 단계(재검/생활습관 등)로
   자연스럽게 이어지는 긍정적 톤을 유지할 것. 판정이 없으면(계산 불가) 판정 언급 없이
   수치만으로 담백하게 작성할 것
5. 직전 검사 대비 변화가 주어졌다면 자연스럽게 반영하되, 없다고 언급하거나 아쉬워하지 말 것
6. 판정은 입력재료에 [판정]으로 명시된 것만 사용할 것 — BMI 등 [판정]이 주어지지 않은
   개별 수치에 대해 "정상", "경계", "높은 편" 등 스스로 새로운 판정/평가를 만들어 붙이지
   말 것. 그런 수치는 판정 없이 값 그대로만 언급할 것

[금지 표현 예시 — 아래처럼 스스로 판정 내리지 말 것(실제로 반복 발생한 패턴)]
- "BMI는 25.7로 경계선에 위치해 있습니다" / "BMI는 25.7로 과체중 경계입니다" 같은 표현
  절대 금지 — [판정]에 BMI 관련 판정이 없으므로 "BMI는 25.7입니다"까지만 쓸 것
- "체지방율이 다소 높은 편입니다"도 [판정]에 없다면 금지 — "체지방율은 42.4%입니다"처럼
  수치만 담백하게 쓸 것
- 요컨대 [판정]에 등장하지 않는 모든 수치는 어떤 형용사(높다/낮다/좋다/경계다 등)도
  붙이지 않고 숫자만 그대로 서술할 것

[자체검토 — 출력 전 스스로 점검]
- 이 환자의 실제 수치를 하나 이상 그대로 인용했는가?
- 질병명이나 치료 효과를 단정적으로 창작하지 않았는가?
- 판정이 낮아도 겁을 주지 않고 자연스러운 다음 단계로 이어지는 톤인가?
- [판정]으로 주어지지 않은 수치(예: BMI)에 스스로 "정상/경계/높음" 같은 평가를 새로
  붙이지 않았는가? 붙였다면 제거하고 값만 남길 것
위 기준에 걸리면 반드시 고친 뒤 최종 코멘트만 출력하세요.`;

export type BodyCompositionExplanationInput = {
  examType: "BODY_COMPOSITION";
  weightKg: number;
  bmi: number | null;
  bodyFatPercent: number;
  whr: number;
  smi: number | null;
  // 4단계 판정 라벨(약함/경계/양호/우수) — 계산 불가(성별 미입력 등)면 null.
  judgementLabel: string | null;
  // 직전 검사 대비 변화 요약(getExamTrend 재사용) — 1건뿐이면 null.
  trend: string | null;
};

export type StrengthTestExplanationInput = {
  examType: "STRENGTH_TEST";
  gripLeftKg: number;
  gripRightKg: number;
  gripAvgKg: number;
  judgementLabel: string | null;
  // 근력나이 환산 메시지(gripAgePatientMessage 재사용) — "또래 평균과 비교했을 때 약 OO세..."
  gripAgeMessage: string;
  trend: string | null;
};

export type ExamExplanationInput = BodyCompositionExplanationInput | StrengthTestExplanationInput;

function buildUserMessage(input: ExamExplanationInput): string {
  if (input.examType === "BODY_COMPOSITION") {
    const parts = [
      `체중 ${input.weightKg}kg`,
      input.bmi != null ? `BMI ${input.bmi.toFixed(1)}` : null,
      `체지방율 ${input.bodyFatPercent}%`,
      `WHR ${input.whr}`,
      input.smi != null ? `SMI(골격근량 지수) ${input.smi.toFixed(2)}` : null,
    ].filter((v): v is string => v !== null);

    return `[검사 종류] 인바디(체성분) 검사
[실제 측정값] ${parts.join(", ")}
[판정] ${input.judgementLabel ?? "없음(계산 불가)"}
[직전 검사 대비 변화] ${input.trend ?? "없음(첫 검사이거나 변화 없음)"}`;
  }

  return `[검사 종류] 근력검사(악력)
[실제 측정값] 악력 좌 ${input.gripLeftKg}kg / 우 ${input.gripRightKg}kg / 평균 ${input.gripAvgKg.toFixed(1)}kg
[판정] ${input.judgementLabel ?? "없음(계산 불가)"}
[근력나이 환산] ${input.gripAgeMessage}
[직전 검사 대비 변화] ${input.trend ?? "없음(첫 검사이거나 변화 없음)"}`;
}

// 실패 시 그대로 throw한다 — 호출측(examinations.ts)이 "저장은 반드시 성공" 원칙에 맞춰
// try/catch로 감싸고 null로 대체하는 책임을 진다(program-teaching.ts의 AI 호출 함수들과
// 동일하게, 이 함수 자체는 실패를 삼키지 않는다).
export async function generateExamExplanation(input: ExamExplanationInput): Promise<string> {
  assertOpenAiApiKeyConfigured();
  const client = new OpenAI();

  const response = await client.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: EXAM_EXPLANATION_SYSTEM_PROMPT },
      { role: "user", content: buildUserMessage(input) },
    ],
    // 2~4문장 짧은 코멘트라 200이면 충분(task.md 지시).
    max_tokens: 200,
  });

  const text = response.choices[0]?.message?.content?.trim();
  if (!text) throw new Error("AI가 빈 응답을 반환했습니다.");
  return text;
}
