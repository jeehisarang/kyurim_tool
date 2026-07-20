import OpenAI from "openai";
import { assertOpenAiApiKeyConfigured } from "@/lib/ai-message";
export { HRV_SAFETY_NOTICE } from "@/lib/hrv-constants";

// 텍스트 코멘트 작성 전용 모델 — 문구 자연스러움 개선 목적으로 gpt-4o-mini에서
// gpt-4.1-mini로 교체(task.md 모델 교체 작업). 이미지 판독(VISION_MODEL)과는
// 이미 분리된 별도 호출이라 이 상수만 바꿔도 판독 쪽에는 영향이 없다.
const TEXT_MODEL = "gpt-4.1-mini";
// 자율신경균형도 이미지 판독 전용 모델(task.md 모델 교체 작업) — gpt-4o-mini가 매트릭스
// 마커 위치를 5개 정식 명칭이 아닌 합성 표현으로 잘못 읽는 경우가 실측으로 확인돼서, 이미지
// 판독 호출 1곳만 더 강한 모델로 교체했다(이번 라운드와 무관, 그대로 유지). 환자당 이미지
// 판독은 레코드 생성/강제 재생성 시점에만 최대 2회(이번+직전) 발생해 비용 영향이 적다.
const VISION_MODEL = "gpt-4.1";

// 이 프롬프트 버전 식별자 — HrvTestRecord.aiCommentaryVersion에 그대로 저장된다(task.md
// "건강 리포트" 7카드 리뉴얼). hrv.ts의 saveHrvCommentarySections가 코멘트를 실제로 새로
// 생성/저장할 때만 이 값을 함께 쓴다. 과거 레코드(null/"MIBYEONG_V1")는 건드리지 않고 그대로
// 옛 4섹션 UI로 계속 보여준다(회귀 방지) — 이 버전 문자열로만 신규 카드 UI로 분기한다.
export const HRV_COMMENTARY_VERSION = "HEALTH_REPORT_V1";

export type TcmPatternMapEntry = { symptoms: string; pattern: string; phrase: string };

// 7카드 중 AI가 직접 작성하는 4개 카드만 이 마커로 구분한다(task.md) — 나머지 3개
// (카드2 내가 선택한 증상/카드3 주목할 변화/카드6 위험신호)는 AI가 아니라 코드가 결정론적으로
// 만든다(hrv-health-report.ts) — 지어내거나 놓치면 안 되는 정확한 데이터라 LLM에 맡기지 않음.
// deviceReading→headline(카드1), clinicalMeaning 슬롯은 이번 버전에서 안 쓰고(카드3은 코드가
// 별도 필드에 저장), lifestyleGuide→treatmentAndLifestyle(카드7, 카드형 재구성 이후로는
// "공통 생활관리" 문단만 담당 — 카테고리별 치료 방향은 hrv-health-report.ts의 고정 키워드
// 사전(buildCategoryTreatmentCards, AI 호출 없음)이 별도 카드로 만든다), tcmInterpretation은
// 그대로 카드4로 재사용(DB 필드명 유지, 마이그레이션 회피 — MIBYEONG_V1과 동일 관례).
const SECTION_MARKERS = {
  headline: "[헤드라인]",
  tcmInterpretation: "[한의건강해석]",
  progression: "[경향지속시]",
  treatmentAndLifestyle: "[치료방향양생]",
} as const;

export type HrvExplanationSections = {
  headline: string;
  tcmInterpretation: string;
  progression: string;
  treatmentAndLifestyle: string;
};

/**
 * 자율신경맥파기(HRV) 검사 "건강 리포트" — 7카드 매거진 스타일 리뉴얼(task.md, 배경: 김우석
 * 테스트 실사용 피드백). "AI 코멘트"라는 용어를 프롬프트/UI 어디에도 남기지 않는다(원장 요청
 * 1번). AI는 7카드 중 4개(헤드라인/한의건강해석/경향지속시/치료방향양생)만 작성하고, 나머지
 * 3개(내가 선택한 증상/주목할 변화/위험신호)는 지어내거나 놓치면 안 되는 정확한 데이터라
 * hrv-health-report.ts가 코드로 결정론적으로 만든다 — AI에게 맡기지 않는다.
 */
const HRV_EXPLANATION_SYSTEM_PROMPT = `당신은 한의원에서 환자에게 HRV(자율신경맥파기) 검사 결과를 설명하는 원장을 돕는 카피라이터입니다.
환자가 보게 될 화면은 "건강 리포트"라는 이름의 카드 7개입니다 — "AI"라는 단어나 "AI 코멘트"
같은 표현은 어디에도 쓰지 마세요(이 리포트가 AI로 만들어졌다는 티를 내지 않습니다).

이 리포트의 중심 철학은 한의학의 "미병(未病)/치미병(治未病)" — 질병으로 확정되기 전, 몸의
불균형 신호를 미리 포착해 예방적으로 관리한다는 개념입니다. "지금 이 수치가 정상이냐
비정상이냐"를 판정하는 게 아니라 "이 사람의 몸이 어느 방향으로 흘러가고 있는가"를 보여주는
데 초점을 둡니다. 절대 특정 질병명을 예측하거나 확정 진단처럼 들리게 쓰지 마세요 — 항상
증상 수준의 서술만 하고, 유보적 어조("~일 수 있습니다", "~경향과 관련될 수 있습니다")를
유지하세요.

아래 입력재료를 바탕으로 반드시 4개 카드를 작성하세요. 각 카드는 반드시 아래 마커를 정확히
그대로 각자 줄의 맨 앞에 쓰고, 그 다음 줄부터 자연스러운 문단(소제목 없이)으로 내용을 이어
쓰세요. 마커 4개와 그 본문 외에 다른 텍스트는 절대 출력하지 마세요.

[출력 형식 — 이 순서와 마커 문자열을 정확히 지킬 것]
${SECTION_MARKERS.headline}
(카드1 본문)
${SECTION_MARKERS.tcmInterpretation}
(카드4 본문)
${SECTION_MARKERS.progression}
(카드5 본문)
${SECTION_MARKERS.treatmentAndLifestyle}
(카드7 본문)

[강조 표시 — 카드 매거진 UI에서 굵게/색상 강조로 쓰임]
각 카드 본문을 쓰는 과정에서, 핵심 결론 문장이 될 부분은 처음 쓸 때부터 그 자리에서 바로
앞뒤에 별표 두 개(**)씩 붙여서 쓰세요(예: "**담습 경향의 미병 신호로 볼 수 있습니다.**").
그 문장은 그 자리에 그것 하나만 존재해야 합니다.
🚫 절대 금지(반복 문장 버그): 본문을 먼저 별표 없이 쓴 뒤 문단 끝(또는 다른 위치)에 그
문장을 별표로 감싸 한 번 더 반복해서 쓰는 것은 명백한 오류입니다 — 같은 문장이 한 카드
안에 두 번(강조 없는 버전 + 강조된 버전) 나타나서는 절대 안 됩니다. 강조는 "이미 쓴 문장에
표시를 추가하는 것"이지 "그 문장을 다시 한번 쓰는 것"이 아닙니다. 각 카드에는 동일하거나
거의 동일한 의미의 문장이 정확히 1번만 있어야 합니다. 문단 전체나 여러 문장을 감싸지도
말 것. 추가로 카드4(한의건강해석)에서 한의학적 패턴명/카테고리명을 실제로 언급했다면, 그
단어 자체도 별표로 감싸세요(핵심 문장 강조와 별개로 추가 적용 — 이미 핵심 문장 안에 있다면
이중으로 감싸지 말 것).

[카드별 작성 지침]

카드1(헤드라인) — 훅이 되는 첫인상 카드입니다. 두 부분으로 구성하세요:
(a) 증상 인정 문장: [헤드라인 재료]에 실제 체크된 증상 문구가 주어졌다면, 그 증상을
    자연스럽게 녹여 "평소 [증상 관련 표현]이 반복된다면, [카테고리/패턴] 경향을 살펴볼
    필요가 있습니다" 형태로 쓰세요. 예: "평소 몸이 무겁고 잘 붓는 증상은 수분대사가
    원활하지 않은 담습 경향과 관련될 수 있습니다." — 문항 문장을 토씨 하나 안 틀리고
    그대로 인용할 필요는 없지만(자연스러운 표현으로 다듬어도 됨), 실제로 주어진 증상
    내용과 무관한 이야기를 지어내면 안 됩니다. [헤드라인 재료]가 비어있으면(체크리스트
    응답 없음) 특정 증상을 지어내지 말고, "이 검사는 질병 유무를 가르는 게 아니라 몸의
    불균형 신호를 미리 살펴보는 검사"라는 일반적 도입으로 대신하세요.
(b) 완만한 경과 문장: (a) 바로 뒤에 이어서, "이 상태가 계속되면 [일반적인 증상 1~2개]로
    이어질 수 있어, 지금부터 관리가 필요합니다" 형태의 문장을 1개 추가하세요. 여기서
    "일반적인 증상"은 특정 질병명이 아니라 몸에서 흔히 나타나는 증상 수준 표현이어야
    합니다(예: 만성 피로, 소화불량, 수면의 질 저하 등). 진단명·질환명을 절대 쓰지 마세요.

카드4(한의건강해석) —
🩺 [증상 패턴 프로필]이 "없음"이 아닌 실제 카테고리 목록으로 주어졌다면, 이번엔 이 프로필을
최우선 근거로 삼고 아래 [환자 증상기록]/[한의학적 매핑표] 기반 대조 방식은 이번 생성에서
쓰지 마세요(두 체계를 한 번에 섞지 않습니다). 이 프로필은 기기 수치보다 재현성이 안정적인
데이터이므로 유보 어조를 다소 줄이고 좀 더 적극적으로 서술해도 됩니다(원장 판단). 목록에
있는 카테고리명(patientLabel)을 그대로 인용해 미병 신호로 풀어 쓰세요(치료 방향/치료법은
이 카드에서 언급하지 말 것 — 그건 카드7의 몫입니다). 목록에 없는 카테고리명을 지어내지
마세요. 여러 카테고리가 나열돼 있으면(동점 병렬 후보) 전부 자연스럽게 함께 언급하되 등수를
매기듯 서술하지 마세요. "최종적인 변증은 문진·설진·맥진을 통해 확정됩니다" 문구를 포함하세요.

[증상 패턴 프로필]이 "없음"이면 아래 기존 방식대로 판단하세요 — [환자 증상기록]과 [한의학적
매핑표]를 대조해서, 매핑표의 symptoms와 실제로 관련 있는 내용이 확인되면 그 pattern의
phrase를 자연스럽게 인용하며 "미병 신호" 관점으로 풀어 쓸 것. 관련 증상이 확인되지 않으면
특정 패턴을 절대 억지로 끼워맞추지 말고 "동반 증상을 함께 확인하면 더 정확한 판단이
가능합니다" 정도로 유보적으로 마무리할 것. [한의학적 매핑표]에 없는 새로운 병증/변증명을
스스로 창작하지 말 것.

⚠️ ([증상 패턴 프로필]이 "없음"일 때만 적용) 패턴명 언급의 유일한 근거는 [환자 증상기록]에
실제로 적힌 텍스트뿐입니다. 아래 나열한 것은 전부 패턴명을 언급할 근거가 "될 수 없습니다":
- 혈관건강지수·스트레스지수·평균맥박·혈관건강도 등 수치 자체
- 이 카드에서 당신이 직접 쓴 "교감신경 항진", "자율신경 불균형" 같은 생리학적 해석 문구
- "지속적인 긴장/피로가 쌓이면 ~할 수 있다"처럼 그럴듯하지만 [환자 증상기록]에 실제로
  없는 추측성 서술
[환자 증상기록]이 "없음"이면 위 근거들이 아무리 그럴듯해 보여도 패턴명을 단 하나도 언급하지
말 것. 이 조건은 톤이 바뀌어도 절대 완화하지 않습니다.

투명성 문구(반드시 포함): "이 해석은 맥파검사 수치만으로 확정한 것이 아니라 상담설문과
검사 변화를 함께 종합한 결과"라는 취지의 문장을 자연스럽게 녹여 쓰세요.

[자율신경균형도/맥박다양성 판독 결과] 반영 — 사용자 메시지의 [이미지 판독 결과]에 이번
검사(직전 검사 있으면 그것도) 자율신경균형도 구역/맥박다양성 판독 결과가 텍스트로 정리되어
주어집니다. 이 판독은 전용 비전 모델이 이미지를 직접 보고 수행한 결과이니 그대로 신뢰하세요:
- 구역 또는 맥박다양성 값이 "판독 불가(불명확)"거나 "이미지 없음"이면 그 항목은 언급하지
  마세요(추측 금지). 두 값은 서로 독립적으로 판단하세요.
- 값이 정상적으로 주어졌다면 이 카드에 반드시 포함하세요. 자율신경균형도 5유형/맥박다양성은
  독립된 학술 표준이 아니라 기기 자체의 해석 레이어이므로, "기기 분석 기준으로는 ~구역에
  가까운 패턴입니다" 형태로(이 표현 자체 필수 포함) 서술하세요. 구역명은 판독 결과에 주어진
  명칭(과로형만성스트레스/질병형만성스트레스/급성스트레스/초기부정맥/심한부정맥 중 하나)
  그대로만 쓰고 다른 표현으로 바꾸거나 합치지 마세요. 맥박다양성은 "본인의 이전 추세와
  비교해 참고"하는 취지로만 쓰고 정상/비정상으로 단정하지 마세요. 구역명을 그 자체로 하나의
  미병 신호로 재서술해도 됩니다(예: "초기부정맥 구역에 위치해, 아직 뚜렷한 병증은 아니지만
  자율신경 불균형이 시작되는 신호로 볼 수 있습니다"). 단, 이 구역명은 [한의학적 매핑표]의
  패턴명과는 별개 어휘입니다 — 패턴명 언급 규칙([환자 증상기록] 실제 텍스트 있을 때만)은
  구역명 언급 여부와 무관하게 그대로 적용됩니다.
  🔴 하드 제약(생략 절대 금지): 이번 검사 구역이 "초기부정맥" 또는 "심한부정맥"이면, "리듬
  불규칙 가능성이 있어 필요 시 정밀 검사(심전도 등) 확인을 권고드립니다"라는 취지의 안내를
  이 카드 안에 반드시 포함하세요(유보적 어조 유지). 이 두 구역이 아니면 이 안내를 쓰지
  마세요.
- 직전 검사 구역도 주어졌다면(2회차 이상), 이번 구역과 비교해 이동 방향을 사실만 서술하세요
  (예: "직전 급성스트레스 구역에서 이번 초기부정맥 구역으로 이동"). "좋아짐/나빠짐" 같은
  단정적 평가는 붙이지 말 것.
🔴 필수 지시(생략 금지): [이미지 판독 결과]에 값이 정상적으로 주어졌다면 이건 선택이 아니라
이 카드의 핵심 작업입니다 — 반드시 포함시키세요.

카드5(경향지속시) — "이런 경향이 지속되면"이라는 제목의 카드입니다. 질병명이 아니라 증상
수준 경과만 서술하세요(예: "아침 피로, 부종, 소화지연, 몸의 무거움 등이 함께 나타날 수
있습니다"). 카드1의 경과 문장과 겹치지 않게 다른 증상들을 언급하거나 좀 더 구체적으로 풀어
쓰세요. [증상 패턴 프로필]/[한의학적 매핑표]에 근거가 있으면 그 맥락에 맞는 증상을 쓰고,
없으면 자율신경 불균형 일반론 수준으로 담백하게 쓰세요.

카드7(생활관리) — 카테고리별 치료 방향은 이 카드가 아니라 별도의 카테고리별 카드에서 이미
각각 독립적으로 다룹니다(카드형 재구성, task.md) — 그러니 이 카드에서는 [증상 패턴 프로필]의
카테고리명이나 치료원칙을 절대 다시 언급하거나 요약하지 마세요(중복 금지). 이 카드는 누구에게나
적용되는 "공통 생활관리 안내"만 담당합니다. [학술 근거]와 [일반 배경지식]에 있는 내용만
참고해서 규칙적인 생활 리듬, 휴식, 스트레스 관리 등 생활관리 조언 1~2문장을 작성하세요. 그
안에 없는 새로운 의학적 효능/통계를 창작하지 말 것. "연구에 따르면"이 아니라 "임상적으로",
"~하는 경우가 많습니다" 톤만 쓸 것. 복용 중인 약물을 줄이라는 뉘앙스는 절대 쓰지 말 것.
[학술 근거]가 "없음"이면 구체적 방법을 창작하지 말고 아주 짧고 담백하게만 쓸 것.

[일반 배경지식 — 카드7 생활관리 부분에서만 참고, 제조사 자료 기반이라 "연구에 따르면" 인용 금지]
- 교감신경이 과활성화되면 혈관 수축·소화기 혈류 감소·면역 균형 저하로 이어지는 경우가
  많고, 반대로 부교감신경이 과도하게 우위여도 무기력·소화기능 저하 등이 나타날 수 있어
  "스트레스가 아예 없는 것"이 능사는 아닙니다.
- 혈관건강지수는 그날의 긴장·피로·컨디션에 따라 측정할 때마다 달라질 수 있는 값이라,
  한 번의 수치보다 여러 번의 추이를 함께 보는 것이 더 정확합니다.
- 규칙적인 생활 리듬(특히 늦은 취침 지양), 충분한 휴식, 스트레스 관리는 자율신경 균형
  회복에 임상적으로 도움이 되는 경우가 많습니다.

[핵심 원칙]
- 실제 체크된 증상/수치/학술근거에 없는 내용을 창작하지 않기
- 신중한 어조 유지, 질병명·확정 진단 절대 금지(카드1/카드5 특히 중요)
- 진단 확정이 아니라 "미병 신호"라는 예방적 관점을 리포트 전체에서 유지
- 카드7 이전에 어느 카드에서도 구체적 치료법(한약/침 등)을 미리 언급하지 않기(치료 방향은
  카드7에만)
- [일반 배경지식]에 약물 관련 내용은 없으니 스스로 만들어 넣지 말 것

[자체검토 — 출력 전 스스로 점검]
- 4개 카드 순서/마커를 그대로 지켰는가?
- "AI"라는 단어를 어디에도 쓰지 않았는가?
- 카드1/카드5에 질병명·확정 진단이 들어가지 않았는가? 유보적 어조를 유지했는가?
- [헤드라인 재료]가 있다면 카드1이 실제로 그 증상 맥락을 반영했는가(무관한 내용을 지어내지
  않았는가)? 없다면 일반적 도입으로 대신했는가?
- [증상 패턴 프로필]이 있으면 카드4에서 그것만 근거로 쓰고 매핑표 방식과 섞지 않았는가?
  목록에 없는 카테고리명을 지어내지 않았는가?
- 카드7 이전 카드에 구체적 치료법을 미리 언급하지 않았는가?
- 카드7(생활관리)에서 [증상 패턴 프로필]의 카테고리명/치료원칙을 다시 언급하지 않았는가
  (카테고리별 치료 방향은 별도 카드에서 이미 다루므로 중복 금지)?
- [환자 증상기록]이 "없음"인데 패턴명을 언급하지 않았는가?
- 각 카드에 **핵심 문장** 강조가 정확히 1개씩 있는가? 같은 문장이 강조 없는 버전+강조된
  버전으로 두 번 나타나는 카드가 있는지 다시 확인했는가(있으면 강조 없는 쪽을 지울 것)?
- 구역명을 언급했다면 "기기 분석 기준으로는 ~에 가까운 패턴입니다" 표현을 포함했는가?
  맥박다양성은 "본인의 이전 추세와 비교해 참고"하는 취지로만 썼는가?
- 이번 검사 구역이 초기부정맥/심한부정맥이면 "정밀 검사(심전도 등) 확인 권고" 안내를
  카드4에 포함했는가?
- 카드4에 "맥파검사만으로 확정한 것이 아니라 상담설문과 검사 변화를 종합" 취지의 투명성
  문구를 포함했는가?
위 기준에 걸리면 반드시 고친 뒤 최종 리포트만 출력하세요.`;

export type HrvExplanationInput = {
  vascularHealthIndex: number;
  vascularHealthType: string;
  avgPulse: number;
  // null이면 "혈관건강도 측정"만 하고 스트레스 지수 측정까지는 안 한 경우(유비오맥파 CSV
  // 자동연동, task.md) — buildUserMessage가 "측정 안 함"으로 표기해 AI가 수치를 창작하지
  // 않게 한다.
  stressIndex: number | null;
  // 원장 작성 학술 근거(ExamAcademicGuide.content) — 미작성이면 null.
  academicGuide: string | null;
  // 원장 작성 한의학적 매핑표(ExamAcademicGuide.tcmPatternMapJson 파싱값) — 미작성이면 빈 배열.
  tcmPatternMap: TcmPatternMapEntry[];
  // 핵심프로필 + 최신 상담노트 + 최근 PatientNote를 하나로 조립한 텍스트(hrv.ts에서 구성) —
  // 아무 재료도 없으면 null.
  patientSymptomMaterial: string | null;
  // 이번 검사의 종합 리포트 이미지(base64, 파일 확장자 없는 순수 데이터) — 자율신경균형도/
  // 맥박다양성 앵커 반영을 위한 비전 입력. 이미지 저장/판독 실패 시 null.
  imageBase64: string | null;
  // 직전 검사의 종합 리포트 이미지(base64) — 자율신경균형도 구역 이동 방향 서술용.
  previousImageBase64: string | null;
  // 증상 패턴 프로필(task.md) — 환자가 상담설문에서 직접 체크한 응답의 후보(동점 병렬 포함)
  // 카테고리만 뽑아 넘긴다(tcm-checklist.ts getTcmCategoryProfileForAi). 응답이 없거나
  // 후보가 하나도 없으면 null — 이 경우 기존 [환자 증상기록]/[한의학적 매핑표] 방식이
  // 그대로 동작한다(병행 원칙). treatmentPrinciple이 null인 카테고리는 원장이 아직
  // 입력하지 않은 상태라는 뜻 — AI가 구체적 치료법을 창작하면 안 된다.
  tcmCategoryProfile: { patientLabel: string; treatmentPrinciple: string | null }[] | null;
  // 카드1(헤드라인) 재료 — 후보 카테고리에서 "심하다" 응답 문항 우선, 없으면 "경미하다"
  // 문항 중 상위 최대 2개(hrv-health-report.ts에서 계산, task.md "프롬프트 조립 순서" 2번).
  // 응답 자체가 없거나 후보가 없으면 빈 배열 — 이 경우 카드1은 일반적 도입 문구로 대신한다.
  checkedSymptomsForHeadline: string[];
};

function formatTcmPatternMap(entries: TcmPatternMapEntry[]): string {
  if (entries.length === 0) return "없음";
  return entries
    .map((e) => `- symptoms: ${e.symptoms} / pattern: ${e.pattern} / phrase: ${e.phrase}`)
    .join("\n");
}

function formatTcmCategoryProfile(profile: { patientLabel: string; treatmentPrinciple: string | null }[] | null): string {
  if (!profile || profile.length === 0) return "없음 — 아래 [한의학적 매핑표]/[환자 증상기록] 기반 방식으로 판단할 것";
  return profile
    .map((c) => `- ${c.patientLabel} (${c.treatmentPrinciple ? `치료원칙: ${c.treatmentPrinciple}` : "치료원칙 미입력"})`)
    .join("\n");
}

function formatCheckedSymptoms(symptoms: string[]): string {
  if (symptoms.length === 0) return "없음 — 카드1은 일반적 도입 문구로 작성할 것";
  return symptoms.map((s) => `- ${s}`).join("\n");
}

function buildUserMessage(input: HrvExplanationInput, readingSummary: string): string {
  const stressIndexText = input.stressIndex === null ? "측정 안 함(혈관건강도 측정만 진행됨)" : String(input.stressIndex);
  return `[검사 종류] 자율신경맥파기(HRV) 검사
[실제 측정값(참고용, 카드1/4/5/7에서 그대로 인용 강제 아님)] 혈관건강지수 ${input.vascularHealthIndex}, 혈관건강도 ${input.vascularHealthType}등급, 평균맥박 ${input.avgPulse}, 스트레스지수 ${stressIndexText}
[이미지 판독 결과]
${readingSummary}
[헤드라인 재료] ${formatCheckedSymptoms(input.checkedSymptomsForHeadline)}
[학술 근거] ${input.academicGuide ?? "없음 — 카드7 생활관리는 아주 짧고 담백하게만 작성할 것"}
[증상 패턴 프로필] ${formatTcmCategoryProfile(input.tcmCategoryProfile)}
[한의학적 매핑표] ${formatTcmPatternMap(input.tcmPatternMap)}
[환자 증상기록] ${input.patientSymptomMaterial ?? "없음 — 카드4 한의건강해석은 유보적으로 마무리할 것"}`;
}

// AI 응답을 SECTION_MARKERS 기준으로 4개 필드로 분리한다. 마커 하나라도 빠지거나 순서가
// 어긋나면(모델이 형식을 안 지킨 드문 경우) throw해서 호출측이 실패로 처리하게 한다 —
// 섹션이 뒤섞인 채로 저장되는 것보다 재생성 실패가 낫다.
function parseHrvExplanationSections(text: string): HrvExplanationSections {
  const order = [
    ["headline", SECTION_MARKERS.headline],
    ["tcmInterpretation", SECTION_MARKERS.tcmInterpretation],
    ["progression", SECTION_MARKERS.progression],
    ["treatmentAndLifestyle", SECTION_MARKERS.treatmentAndLifestyle],
  ] as const;

  const indices = order.map(([, marker]) => text.indexOf(marker));
  if (indices.some((idx) => idx === -1)) {
    throw new Error("AI 응답에서 4개 카드 마커를 찾지 못했습니다.");
  }
  for (let i = 1; i < indices.length; i++) {
    if (indices[i] <= indices[i - 1]) {
      throw new Error("AI 응답의 카드 순서가 올바르지 않습니다.");
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

// [환자 증상기록]이 "없음"인데도 카드4에 매핑표의 패턴명/phrase가 등장하는지 검사한다.
// 프롬프트 지시만으로는 안정적으로 안 지켜져서(실사용 중 재발 확인) 코드로 한 번 더 걸러낸다.
function violatesPatternNameRule(
  tcmInterpretation: string,
  tcmPatternMap: TcmPatternMapEntry[],
  patientSymptomMaterial: string | null,
  tcmCategoryProfileGiven: boolean,
): boolean {
  // 증상 패턴 프로필이 주어지면 이번 생성은 그 프로필만 근거로 삼도록 지시했으므로(두 체계를
  // 섞지 않음), 기존 매핑표 기반 패턴명은 증상기록 유무와 무관하게 등장하면 안 된다.
  if (tcmCategoryProfileGiven) {
    return tcmPatternMap.some(
      (entry) => tcmInterpretation.includes(entry.pattern) || tcmInterpretation.includes(entry.phrase),
    );
  }
  if (patientSymptomMaterial !== null) return false;
  return tcmPatternMap.some(
    (entry) => tcmInterpretation.includes(entry.pattern) || tcmInterpretation.includes(entry.phrase),
  );
}

// 증상 패턴 프로필의 후보 카테고리 전부가 치료원칙 미입력 상태인데도 카드4에서 구체적
// 치료법 어휘를 언급하면 창작으로 본다 — 입력 자체에 치료 관련 정보가 전혀 없어 코드로
// 결정적으로 검증 가능하다(일부만 미입력인 경우는 텍스트만으로 소속 구분 불가해 대상 아님).
// 카드7(생활관리)은 카드형 재구성(task.md) 이후 치료원칙을 아예 다루지 않으므로 이 검사
// 대상에서 빠졌다 — 카테고리별 치료 방향은 이제 AI가 아니라 hrv-health-report.ts의 고정
// 키워드 사전(buildCategoryTreatmentCards)이 담당해 애초에 창작 위험 자체가 없다.
const TREATMENT_KEYWORDS = ["한약", "침 치료", "탕약", "처방", "뜸"];

function violatesInventedTreatmentRule(
  combinedText: string,
  tcmCategoryProfile: { patientLabel: string; treatmentPrinciple: string | null }[] | null,
): boolean {
  if (!tcmCategoryProfile || tcmCategoryProfile.length === 0) return false;
  const allMissing = tcmCategoryProfile.every((c) => c.treatmentPrinciple === null);
  if (!allMissing) return false;
  return TREATMENT_KEYWORDS.some((k) => combinedText.includes(k));
}

// [증상 패턴 프로필]이 실제로 주어졌는데도(후보 카테고리 존재) 카드4가 그중 어느 것도
// 언급하지 않은 채 기존 방식으로만 서술하는 경우가 실측 확인됨 — patientLabel은 정확한
// 문자열이라 코드로 결정적으로 검증 가능하다.
function violatesMissingCategoryProfileMention(
  tcmInterpretation: string,
  tcmCategoryProfile: { patientLabel: string; treatmentPrinciple: string | null }[] | null,
): boolean {
  if (!tcmCategoryProfile || tcmCategoryProfile.length === 0) return false;
  return !tcmCategoryProfile.some((c) => tcmInterpretation.includes(c.patientLabel));
}

// 프롬프트 지시 5개 구역명 중 정확히 하나만 쓰라고 못박아도, 실측 확인 결과 gpt-4o-mini가
// "초기 급성 스트레스"처럼 두 구역명을 섞은 존재하지 않는 명칭을 만들어내는 경우가 있었다.
// 패턴명 규칙과 달리 이건 "이미지를 얼마나 정확히 읽었는가"의 문제라 정답을 코드로 알 수
// 없으므로, 여기서는 "구역을 언급했다면 5개 정식 명칭 중 하나여야 한다"는 어휘 규칙만
// 검증한다 — 언급 자체를 안 했으면(흐릿해서 생략 등 정상 경로) 위반이 아니다.
const AUTONOMIC_ZONE_NAMES = [
  "과로형만성스트레스",
  "질병형만성스트레스",
  "급성스트레스",
  "초기부정맥",
  "심한부정맥",
] as const;

// 반복 문장 버그 — 실측 확인 결과 gpt-4.1-mini가 "핵심 문장에 강조 표시를 추가"하라는
// 지시를, "그 문장을 강조 표시와 함께 한 번 더 쓰기"로 잘못 수행해 같은 문장이 강조 없는
// 버전 + **강조된** 버전으로 한 카드 안에 두 번 나타나는 경우가 있었다. 프롬프트 지시(강조
// 표시 섹션)로 근본 원인을 수정했지만, 정확한 문자열 중복은 코드로 결정적으로 검증 가능하므로
// 한 번 더 코드로 걸러낸다.
function hasDuplicatedEmphasisSentence(text: string): boolean {
  const boldMatches = [...text.matchAll(/\*\*(.+?)\*\*/g)];
  return boldMatches.some(([full, inner]) => {
    const innerTrimmed = inner.trim();
    if (innerTrimmed.length < 8) return false; // 너무 짧은 강조(패턴명 등)는 우연히 겹칠 수 있어 제외
    const idx = text.indexOf(full);
    const withoutThisBold = text.slice(0, idx) + text.slice(idx + full.length);
    return withoutThisBold.includes(innerTrimmed);
  });
}

function violatesDuplicateSentenceRule(sections: HrvExplanationSections): boolean {
  return Object.values(sections).some(hasDuplicatedEmphasisSentence);
}

// 자율신경균형도 구역 관련 서술은 새 카드 구조에서 카드4(한의건강해석)로 옮겨졌다(옛
// clinicalMeaning 카드가 카드3으로 대체되면서 코드 계산으로 넘어갔기 때문 — hrv-health-report.ts).
function violatesAutonomicZoneVocabRule(tcmInterpretation: string, hasImage: boolean): boolean {
  if (!hasImage) return false;
  if (!tcmInterpretation.includes("구역")) return false;
  return !AUTONOMIC_ZONE_NAMES.some((name) => tcmInterpretation.includes(name));
}

// 이미지 판독 전용 응답 형식 — 텍스트 코멘트 생성 모델(TEXT_MODEL)과 완전히 분리된 별도 호출
// (VISION_MODEL)의 결과물이다. "구역: X" / "맥박다양성: Y" 두 줄만 요구해서 파싱을 단순하고
// 결정적으로 유지한다.
type AutonomicReading = { zone: string | null; pulseVariability: string | null };

const UNREADABLE = "판독불가";

const VISION_READING_PROMPT = `이 이미지는 자율신경맥파기(HRV) 검사 종합 리포트입니다. 아래 두 가지를 이미지에서 실제로 찾아 정확히 이 형식으로만 답하세요(다른 설명은 쓰지 마세요):
구역: <다섯 명칭 중 하나 또는 ${UNREADABLE}>
맥박다양성: <숫자 또는 ${UNREADABLE}>

'자율신경균형도' 매트릭스(격자)에서 색칠되거나 테두리로 강조된 마커 칸이 정확히 어느 구역(행×열
교차 칸)에 있는지 확인한 뒤, 반드시 아래 5개 명칭 중 정확히 하나만 고르세요(이 5개 외의 표현이나
두 명칭을 합친 표현은 절대 쓰지 마세요): 과로형만성스트레스, 질병형만성스트레스, 급성스트레스,
초기부정맥, 심한부정맥. 마커 칸이 흐릿하거나 이미지가 잘려서 명확히 안 보이면 추측하지 말고
구역을 "${UNREADABLE}"라고 답하세요.
'맥박다양성 = 숫자' 형태로 적힌 실제 숫자를 그대로 옮기세요. 흐릿하거나 안 보이면 맥박다양성을
"${UNREADABLE}"라고 답하세요.`;

function parseAutonomicReadingText(text: string): AutonomicReading {
  const zoneMatch = /구역\s*[:：]\s*([^\n]+)/.exec(text);
  const pulseMatch = /맥박다양성\s*[:：]\s*([^\n]+)/.exec(text);
  const rawZone = zoneMatch?.[1]?.trim() ?? null;
  const rawPulse = pulseMatch?.[1]?.trim() ?? null;
  const zone = rawZone && (AUTONOMIC_ZONE_NAMES as readonly string[]).includes(rawZone) ? rawZone : null;
  const pulseVariability = rawPulse && rawPulse !== UNREADABLE && /^\d+(\.\d+)?$/.test(rawPulse) ? rawPulse : null;
  return { zone, pulseVariability };
}

// 구역 답변이 5개 정식 명칭도 아니고 정직하게 "판독불가"라고 답한 것도 아니면(=형식을 못
// 지켰거나 합성 표현을 만들어냄) 재시도 대상으로 본다.
function isInvalidZoneAnswer(text: string): boolean {
  const zoneMatch = /구역\s*[:：]\s*([^\n]+)/.exec(text);
  const rawZone = zoneMatch?.[1]?.trim();
  if (!rawZone) return true;
  if (rawZone === UNREADABLE) return false;
  return !(AUTONOMIC_ZONE_NAMES as readonly string[]).includes(rawZone);
}

async function callVisionModel(imageBase64: string, extraInstruction?: string): Promise<string> {
  const client = new OpenAI();
  const text = extraInstruction ? `${VISION_READING_PROMPT}\n\n[교정 지시] ${extraInstruction}` : VISION_READING_PROMPT;

  const response = await client.chat.completions.create({
    model: VISION_MODEL,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text },
          // detail:"high" 필수 — auto(기본값)로는 이미지 안의 작은 매트릭스 마커/수치를
          // 세밀하게 읽지 못하는 게 실측으로 확인됐다.
          { type: "image_url", image_url: { url: `data:image/jpeg;base64,${imageBase64}`, detail: "high" } },
        ],
      },
    ],
    max_tokens: 60,
  });
  return response.choices[0]?.message?.content?.trim() ?? "";
}

// 자율신경균형도/맥박다양성 판독 전용 호출(VISION_MODEL) — 텍스트 코멘트 생성(TEXT_MODEL)과
// 완전히 분리된 별도 호출이다. 구역 답변이 무효하면(5개 정식 명칭도 판독불가도 아님) 1회
// 재시도하고, 그래도 무효하면 판독불가로 안전하게 처리한다 — 패턴명 규칙과 달리 정답을
// 코드로 알 수 없는 영역이라 이 함수는 실패 처리하지 않고 항상 값(또는 null)을 반환한다.
async function readAutonomicBalance(imageBase64: string): Promise<AutonomicReading> {
  const first = await callVisionModel(imageBase64);
  if (!isInvalidZoneAnswer(first)) {
    return parseAutonomicReadingText(first);
  }
  const retried = await callVisionModel(
    imageBase64,
    "직전 답변의 구역이 5개 정식 명칭 중 하나도 아니고 판독불가도 아니었습니다. 마커 칸을 다시 " +
      `확인해서 5개 명칭 중 정확히 하나를 고르거나, 확신이 안 서면 "${UNREADABLE}"라고 답하세요.`,
  );
  return parseAutonomicReadingText(retried);
}

// 부정맥 구역 안전 안내(GPT 딥리서치로 자율신경균형도 5유형/맥박다양성이 독립 학술표준이
// 아니라 기기 해석 레이어임을 확인한 뒤 추가) — 프롬프트 지시만으로는 매 생성마다 100%
// 보장되지 않으므로, 이 문구는 AI가 자유롭게 표현을 바꾸지 못하도록 고정 텍스트로 두고
// 코드가 직접 보장한다(HRV_SAFETY_NOTICE와 동일 원칙). 새 카드 구조에서는 카드4
// (tcmInterpretation)에 붙인다(구역 서술이 카드4로 옮겨졌으므로).
const ARRHYTHMIA_ZONES = ["초기부정맥", "심한부정맥"] as const;
const ARRHYTHMIA_NOTICE = "리듬 불규칙 가능성이 있어 필요 시 정밀 검사(심전도 등) 확인을 권고드립니다.";

function ensureArrhythmiaNotice(tcmInterpretation: string, currentZone: string | null): string {
  if (!currentZone || !(ARRHYTHMIA_ZONES as readonly string[]).includes(currentZone)) return tcmInterpretation;
  if (tcmInterpretation.includes("심전도") || tcmInterpretation.includes("정밀 검사")) return tcmInterpretation;
  return `${tcmInterpretation} ${ARRHYTHMIA_NOTICE}`;
}

function formatReadingLine(reading: AutonomicReading | null, hasImage: boolean): string {
  if (!hasImage) return "이미지 없음";
  const zone = reading?.zone ?? "판독 불가(불명확)";
  const pulseVariability = reading?.pulseVariability ?? "판독 불가(불명확)";
  return `구역=${zone}, 맥박다양성=${pulseVariability}`;
}

function buildReadingSummary(
  input: HrvExplanationInput,
  current: AutonomicReading | null,
  previous: AutonomicReading | null,
): string {
  const lines = [`이번 검사: ${formatReadingLine(current, input.imageBase64 !== null)}`];
  lines.push(
    input.previousImageBase64
      ? `직전 검사: ${formatReadingLine(previous, true)}`
      : "직전 검사: 해당 없음(첫 검사이거나 직전 이미지 없음)",
  );
  return lines.join("\n");
}

async function callHrvExplanationModel(
  input: HrvExplanationInput,
  readingSummary: string,
  extraInstruction?: string,
): Promise<HrvExplanationSections> {
  const client = new OpenAI();
  const userMessage = extraInstruction
    ? `${buildUserMessage(input, readingSummary)}\n\n[교정 지시] ${extraInstruction}`
    : buildUserMessage(input, readingSummary);

  const response = await client.chat.completions.create({
    model: TEXT_MODEL,
    messages: [
      { role: "system", content: HRV_EXPLANATION_SYSTEM_PROMPT },
      { role: "user", content: userMessage },
    ],
    max_tokens: 900,
  });

  const text = response.choices[0]?.message?.content?.trim();
  if (!text) throw new Error("AI가 빈 응답을 반환했습니다.");
  return parseHrvExplanationSections(text);
}

// 실패 시 그대로 throw한다 — 호출측(hrv.ts)이 "저장은 반드시 성공" 원칙에 맞춰 try/catch로
// 감싸고 null로 대체하는 책임을 진다. 위반이 감지되면 교정 지시를 덧붙여 1회 재시도하고,
// 그래도 위반이면 포기하고 throw한다 — 위반된 리포트를 그대로 저장하는 것보다 이번 생성
// 실패가 낫다(안전 원칙 우선).
export async function generateHrvExplanation(input: HrvExplanationInput): Promise<HrvExplanationSections> {
  assertOpenAiApiKeyConfigured();
  const hasImage = input.imageBase64 !== null;

  // 이미지 판독(VISION_MODEL)을 텍스트 생성(TEXT_MODEL) 호출보다 먼저 끝내서, 판독 결과를
  // 이미 검증된 텍스트 재료로 텍스트 생성 프롬프트에 그대로 꽂아 넣는다 — 텍스트 생성
  // 호출은 이미지를 직접 받지 않는다.
  const currentReading = input.imageBase64 ? await readAutonomicBalance(input.imageBase64) : null;
  const previousReading = input.previousImageBase64 ? await readAutonomicBalance(input.previousImageBase64) : null;
  const readingSummary = buildReadingSummary(input, currentReading, previousReading);

  const currentZone = currentReading?.zone ?? null;
  const tcmCategoryProfileGiven = input.tcmCategoryProfile !== null && input.tcmCategoryProfile.length > 0;

  const evaluate = (s: HrvExplanationSections) => {
    return {
      patternViolation: violatesPatternNameRule(s.tcmInterpretation, input.tcmPatternMap, input.patientSymptomMaterial, tcmCategoryProfileGiven),
      zoneViolation: violatesAutonomicZoneVocabRule(s.tcmInterpretation, hasImage),
      duplicateViolation: violatesDuplicateSentenceRule(s),
      inventedTreatmentViolation: violatesInventedTreatmentRule(s.tcmInterpretation, input.tcmCategoryProfile),
      missingProfileMention: violatesMissingCategoryProfileMention(s.tcmInterpretation, input.tcmCategoryProfile),
    };
  };

  const first = await callHrvExplanationModel(input, readingSummary);
  const firstViolations = evaluate(first);
  const firstHasViolation = Object.values(firstViolations).some(Boolean);
  if (!firstHasViolation) {
    return { ...first, tcmInterpretation: ensureArrhythmiaNotice(first.tcmInterpretation, currentZone) };
  }

  const correctionInstructions: string[] = [];
  if (firstViolations.missingProfileMention) {
    correctionInstructions.push(
      "직전 응답의 카드4(한의건강해석)가 [증상 패턴 프로필]에 나열된 카테고리를 전혀 언급하지 " +
        "않고 기존 방식으로만 서술했습니다. 이번에는 [증상 패턴 프로필]에 나열된 카테고리명을 " +
        "반드시 그대로 인용해서 카드4를 작성하세요(생략 금지).",
    );
  }
  if (firstViolations.patternViolation) {
    correctionInstructions.push(
      tcmCategoryProfileGiven
        ? "직전 응답의 카드4에서 [증상 패턴 프로필]이 주어졌는데도 기존 [한의학적 매핑표]의 " +
            "패턴명/phrase를 함께 언급하는 오류가 있었습니다. 이번에는 [증상 패턴 프로필]에 " +
            "나열된 카테고리명만 근거로 쓰고, 매핑표 쪽 패턴명은 전혀 언급하지 마세요."
        : "직전 응답의 카드4에서 [환자 증상기록]이 없는데도 매핑표의 패턴명이나 phrase를 " +
            "언급하는 오류가 있었습니다. 이번에는 카드4에서 패턴명을 단 하나도 언급하지 말고, " +
            "수치에 대한 일반적 해석까지만 서술하세요.",
    );
  }
  if (firstViolations.inventedTreatmentViolation) {
    correctionInstructions.push(
      "직전 응답에서 [증상 패턴 프로필]의 모든 카테고리가 치료원칙 미입력 상태인데도 구체적인 " +
        "치료법(한약/침 치료 등)을 언급하는 오류가 있었습니다. 이번에는 치료원칙이 미입력인 " +
        "카테고리에 대해 카테고리명/신호만 언급하고 구체적 치료법은 절대 언급하지 마세요.",
    );
  }
  if (firstViolations.zoneViolation) {
    correctionInstructions.push(
      "직전 응답의 카드4에서 언급한 자율신경균형도 구역명이 [이미지 판독 결과]에 주어진 명칭 " +
        "그대로가 아니었습니다. [이미지 판독 결과]에 적힌 구역명을 그대로만 인용하고, 다른 " +
        "표현으로 바꾸거나 두 명칭을 합치지 마세요.",
    );
  }
  if (firstViolations.duplicateViolation) {
    correctionInstructions.push(
      "직전 응답에서 강조(**)를 위해 이미 쓴 문장을 그대로 한 번 더 반복해서 썼습니다(같은 " +
        "문장이 강조 없는 버전과 강조된 버전으로 두 번 등장). 이번에는 각 카드에서 핵심 문장을 " +
        "처음 쓸 때부터 그 자리에서 바로 **로 감싸고, 그 문장을 별도로 다시 반복해서 쓰지 마세요.",
    );
  }

  const retried = await callHrvExplanationModel(input, readingSummary, correctionInstructions.join(" "));
  const retriedViolations = evaluate(retried);
  if (retriedViolations.patternViolation) {
    throw new Error("카드4가 증상 패턴 프로필/증상기록 규칙을 재시도 후에도 위반했습니다.");
  }
  if (retriedViolations.duplicateViolation) {
    throw new Error("강조 문장이 중복 등장하는 반복 문장 버그가 재시도 후에도 남아있습니다.");
  }
  if (retriedViolations.inventedTreatmentViolation) {
    throw new Error("치료원칙 미입력 상태인데 구체적 치료법을 창작하는 규칙을 재시도 후에도 위반했습니다.");
  }
  if (retriedViolations.missingProfileMention) {
    throw new Error("증상 패턴 프로필이 주어졌는데도 재시도 후에도 전혀 언급하지 않았습니다.");
  }
  // 구역 어휘 규칙은 코드로 정답을 알 수 있는 조건이 아니라 "판독 결과를 텍스트 생성 모델이
  // 얼마나 그대로 옮겼는가"의 문제라, 재시도 후에도 남아있으면 전체 생성을 실패시키지 않고
  // 그대로 반환한다 — 이미지 판독 자체는 이미 readAutonomicBalance 단계에서 VISION_MODEL +
  // 자체 재시도로 한 번 더 검증됐으므로, 이 단계는 텍스트 생성 모델이 그 검증된 값을 옮기는
  // 과정에서 다시 틀릴 드문 경우에 대비한 2중 안전망이다.
  return { ...retried, tcmInterpretation: ensureArrhythmiaNotice(retried.tcmInterpretation, currentZone) };
}

// 카드7 카테고리별 치료방향 카드는 더 이상 이 파일에서 생성하지 않는다(task.md — AI 호출
// 제거, 원장이 최종 확정한 고정 키워드 사전으로 전환). hrv-health-report.ts의
// buildCategoryTreatmentCards/TREATMENT_PRINCIPLE_KEYWORD_GLOSSARY 참고.
