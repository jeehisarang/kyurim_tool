import OpenAI from "openai";
import { assertOpenAiApiKeyConfigured } from "@/lib/ai-message";
export { HRV_SAFETY_NOTICE } from "@/lib/hrv-constants";

const MODEL = "gpt-4o-mini";

export type TcmPatternMapEntry = { symptoms: string; pattern: string; phrase: string };

// 4단 구조 각 섹션을 구분하는 마커 — AI 응답을 이 마커 기준으로 파싱해 필드별로 저장한다
// (ProgramTeachingCreator처럼 섹션별 수작업 편집을 지원하려면 하나의 문단이 아니라 필드가
// 분리돼 있어야 하므로, task.md 요청에 따라 소제목 없는 이어쓰기 방식에서 전환했다).
const SECTION_MARKERS = {
  deviceReading: "[기기판독]",
  clinicalMeaning: "[임상적의미]",
  lifestyleGuide: "[생활관리]",
  tcmInterpretation: "[한의학적해석]",
} as const;

export type HrvExplanationSections = {
  deviceReading: string;
  clinicalMeaning: string;
  lifestyleGuide: string;
  tcmInterpretation: string;
};

/**
 * 자율신경맥파기(HRV) 검사 AI 코멘트(task.md 최종 통합본) — 4단 고정구조로 생성한다
 * (①기기판독 ②임상적의미 ③생활관리 ④한의학적해석). 5단계 "안전 안내"는 AI가 만들지
 * 않고 시스템이 고정 텍스트를 그대로 붙이므로(HRV_SAFETY_NOTICE, 아래 export) 여기서는
 * 다루지 않는다. exam-explanation.ts의 3원칙(실제 수치 인용/창작 금지/신중한 어조)을
 * 그대로 따르되, 학술 근거·한의학적 매핑표·환자 증상기록까지 재료로 추가했다.
 */
const HRV_EXPLANATION_SYSTEM_PROMPT = `당신은 한의원에서 환자에게 HRV(자율신경맥파기) 검사 결과를 설명하는 원장을 돕는 카피라이터입니다.
아래 입력재료를 바탕으로 반드시 4단 구조로 코멘트를 작성하세요. 각 단계는 반드시 아래 마커를
정확히 그대로 각자 줄의 맨 앞에 쓰고, 그 다음 줄부터 자연스러운 문단(소제목 없이)으로
내용을 이어 쓰세요. 마커 4개와 그 본문 외에 다른 텍스트는 절대 출력하지 마세요(안전 안내는
시스템이 별도로 붙이므로 여기서 쓰지 마세요).

[출력 형식 — 이 순서와 마커 문자열을 정확히 지킬 것]
${SECTION_MARKERS.deviceReading}
(1단계 본문)
${SECTION_MARKERS.clinicalMeaning}
(2단계 본문)
${SECTION_MARKERS.lifestyleGuide}
(3단계 본문)
${SECTION_MARKERS.tcmInterpretation}
(4단계 본문)

[4단 구조]
1) 기기 판독 요약 — 이 환자의 실제 수치(혈관건강지수/혈관건강도/평균맥박/스트레스지수)를
   있는 그대로 인용
2) 임상적 의미 — "기기 기준상"이라는 표현을 명시하고, 혈관건강지수/혈관건강도/스트레스지수를
   각각 별도 축으로 설명할 것. 확정형 진단 표현 대신 "~일 수 있습니다", "~가능성이 있습니다"
   같은 신중한 어조를 유지할 것
3) 생활관리 포인트 — [학술 근거]에 있는 내용만 근거로 재구성. 그 안에 없는 새로운 의학적
   효능/통계를 창작하지 말 것. [학술 근거]가 "없음"이면 구체적 방법을 창작하지 말고 아주
   짧고 담백하게만 쓸 것
4) 한의학적 해석 — [환자 증상기록]과 [한의학적 매핑표]를 대조해서, 매핑표의 symptoms와
   실제로 관련 있는 내용이 확인되면 그 pattern의 phrase를 자연스럽게 인용하며 "가능성을
   시사합니다" 톤으로 언급하고, 반드시 "최종적인 변증은 문진·설진·맥진을 통해 확정됩니다"
   같은 문구를 덧붙일 것. 관련 증상이 확인되지 않으면 특정 패턴을 절대 억지로 끼워맞추지
   말고 "동반 증상을 함께 확인하면 더 정확한 판단이 가능합니다" 정도로 유보적으로 마무리할
   것. [한의학적 매핑표]에 없는 새로운 한의학적 병증/변증명을 스스로 창작하지 말 것.
   한의학적 패턴명(간기울결, 심비양허 등)은 반드시 매핑표의 증상 키워드와 실제로 일치하는
   증상이 [환자 증상기록]에 있을 때만 언급할 것 — 혈관건강지수·스트레스지수·평균맥박 등
   수치 자체는 특정 패턴명을 추론하는 근거로 절대 사용하지 말 것. [환자 증상기록]이
   "없음"이면 패턴명을 단 하나도 언급하지 말고, 수치에 대한 일반적 해석(예: 자율신경
   균형 저하 가능성)까지만 서술할 것

[핵심 원칙]
- 실제 수치 인용 강제, 창작 금지(학술 근거/매핑표에 없는 내용 만들어내지 않기)
- 신중한 어조 유지(확정형으로 임의 전환 금지)
- 관련성 없는 내용은 억지로 끼워넣지 않기
- 직전 검사 대비 변화(추이)가 주어졌으면 자연스럽게 반영하되, 없다고 아쉬워하지 않기

[자체검토 — 출력 전 스스로 점검]
- 4단 구조 순서를 그대로 지켰는가?
- 이 환자의 실제 수치를 하나 이상 인용했는가?
- [학술 근거]/[한의학적 매핑표]에 없는 내용을 창작하지 않았는가?
- 한의학적 해석에서 관련 증상이 없는데 특정 패턴을 억지로 끼워맞추지 않았는가?
- [환자 증상기록]이 "없음"인데 패턴명을 하나라도 언급하지 않았는가? (수치만으로 패턴명을
  추론했다면 그것도 위반 — 반드시 고칠 것)
- 관련 패턴을 언급했다면 "최종 변증은 문진·설진·맥진 후 확정" 취지 문구를 포함했는가?
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
  // 원장 작성 한의학적 매핑표(ExamAcademicGuide.tcmPatternMapJson 파싱값) — 미작성이면 빈 배열.
  tcmPatternMap: TcmPatternMapEntry[];
  // 핵심프로필 + 최신 상담노트 + 최근 PatientNote를 하나로 조립한 텍스트(hrv.ts에서 구성) —
  // 아무 재료도 없으면 null.
  patientSymptomMaterial: string | null;
};

function formatTcmPatternMap(entries: TcmPatternMapEntry[]): string {
  if (entries.length === 0) return "없음";
  return entries
    .map((e) => `- symptoms: ${e.symptoms} / pattern: ${e.pattern} / phrase: ${e.phrase}`)
    .join("\n");
}

function buildUserMessage(input: HrvExplanationInput): string {
  return `[검사 종류] 자율신경맥파기(HRV) 검사
[실제 측정값] 혈관건강지수 ${input.vascularHealthIndex}, 혈관건강도 ${input.vascularHealthType}등급, 평균맥박 ${input.avgPulse}, 스트레스지수 ${input.stressIndex}
[직전 검사 대비 변화] ${input.trend ?? "없음(첫 검사이거나 변화 없음)"}
[학술 근거] ${input.academicGuide ?? "없음 — 생활관리 포인트는 아주 짧고 담백하게만 작성할 것"}
[한의학적 매핑표] ${formatTcmPatternMap(input.tcmPatternMap)}
[환자 증상기록] ${input.patientSymptomMaterial ?? "없음 — 한의학적 해석은 유보적으로 마무리할 것"}`;
}

// AI 응답을 SECTION_MARKERS 기준으로 4개 필드로 분리한다. 마커 하나라도 빠지거나 순서가
// 어긋나면(모델이 형식을 안 지킨 드문 경우) throw해서 호출측이 실패로 처리하게 한다 —
// 섹션이 뒤섞인 채로 저장되는 것보다 재생성 실패가 낫다.
function parseHrvExplanationSections(text: string): HrvExplanationSections {
  const order = [
    ["deviceReading", SECTION_MARKERS.deviceReading],
    ["clinicalMeaning", SECTION_MARKERS.clinicalMeaning],
    ["lifestyleGuide", SECTION_MARKERS.lifestyleGuide],
    ["tcmInterpretation", SECTION_MARKERS.tcmInterpretation],
  ] as const;

  const indices = order.map(([, marker]) => text.indexOf(marker));
  if (indices.some((idx) => idx === -1)) {
    throw new Error("AI 응답에서 4단 구조 마커를 찾지 못했습니다.");
  }
  for (let i = 1; i < indices.length; i++) {
    if (indices[i] <= indices[i - 1]) {
      throw new Error("AI 응답의 4단 구조 순서가 올바르지 않습니다.");
    }
  }

  const result = {} as HrvExplanationSections;
  order.forEach(([key, marker], i) => {
    const start = indices[i] + marker.length;
    const end = i + 1 < indices.length ? indices[i + 1] : text.length;
    result[key] = text.slice(start, end).trim();
  });
  return result;
}

// 실패 시 그대로 throw한다 — 호출측(hrv.ts)이 "저장은 반드시 성공" 원칙에 맞춰 try/catch로
// 감싸고 null로 대체하는 책임을 진다.
export async function generateHrvExplanation(input: HrvExplanationInput): Promise<HrvExplanationSections> {
  assertOpenAiApiKeyConfigured();
  const client = new OpenAI();

  const response = await client.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: HRV_EXPLANATION_SYSTEM_PROMPT },
      { role: "user", content: buildUserMessage(input) },
    ],
    max_tokens: 700,
  });

  const text = response.choices[0]?.message?.content?.trim();
  if (!text) throw new Error("AI가 빈 응답을 반환했습니다.");
  return parseHrvExplanationSections(text);
}
