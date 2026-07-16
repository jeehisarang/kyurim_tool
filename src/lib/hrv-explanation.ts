import OpenAI from "openai";
import { assertOpenAiApiKeyConfigured } from "@/lib/ai-message";
export { HRV_SAFETY_NOTICE } from "@/lib/hrv-constants";

const TEXT_MODEL = "gpt-4o-mini";
// 자율신경균형도 이미지 판독 전용 모델(task.md 모델 교체 작업) — gpt-4o-mini가 매트릭스
// 마커 위치를 5개 정식 명칭이 아닌 합성 표현으로 잘못 읽는 경우가 실측으로 확인돼서, 이미지
// 판독 호출 1곳만 더 강한 모델로 교체한다. 텍스트 코멘트 작성(TEXT_MODEL)은 그대로 유지 —
// 환자당 이미지 판독은 레코드 생성/강제 재생성 시점에만 최대 2회(이번+직전) 발생해 비용
// 영향이 적다.
const VISION_MODEL = "gpt-4.1";

// 이 프롬프트 버전 식별자 — HrvTestRecord.aiCommentaryVersion에 그대로 저장된다(task.md
// "미병" 재설계). hrv.ts의 saveHrvCommentarySections가 코멘트를 실제로 새로 생성/저장할
// 때만 이 값을 함께 쓴다. 다음에 프롬프트를 또 크게 바꾸게 되면 이 상수만 "MIBYEONG_V2"
// 등으로 올리고 UI 쪽에 새 라벨셋 분기만 추가하면 된다.
export const HRV_COMMENTARY_VERSION = "MIBYEONG_V1";

export type TcmPatternMapEntry = { symptoms: string; pattern: string; phrase: string };

// 4단 구조 각 섹션을 구분하는 마커 — AI 응답을 이 마커 기준으로 파싱해 필드별로 저장한다
// (ProgramTeachingCreator처럼 섹션별 수작업 편집을 지원하려면 하나의 문단이 아니라 필드가
// 분리돼 있어야 하므로, task.md 요청에 따라 소제목 없는 이어쓰기 방식에서 전환했다).
// 필드 키(deviceReading 등)는 DB 컬럼명과 맞춰 그대로 두지만(마이그레이션 회피, task.md
// "미병" 재설계 시 원장 확인 요청 답변), 마커 문자열과 순서는 새 콘텐츠 의미에 맞게 바꿨다:
// deviceReading 슬롯 = "미병 도입", clinicalMeaning 슬롯 = "결과와 추이"(옛 기기판독요약을
// 흡수), tcmInterpretation 슬롯 = "한의학적 해석"(순서만 앞으로), lifestyleGuide 슬롯 =
// "양생 안내". 어느 슬롯에 어떤 마커가 붙는지는 이 객체 하나만 보면 알 수 있다.
const SECTION_MARKERS = {
  deviceReading: "[미병도입]",
  clinicalMeaning: "[결과와추이]",
  tcmInterpretation: "[한의학적해석]",
  lifestyleGuide: "[양생안내]",
} as const;

export type HrvExplanationSections = {
  deviceReading: string;
  clinicalMeaning: string;
  lifestyleGuide: string;
  tcmInterpretation: string;
};

/**
 * 자율신경맥파기(HRV) 검사 AI 코멘트 — "미병(未病)" 프레임 재설계(task.md, HRV_COMMENTARY_VERSION
 * 참고). 중심 철학: "지금 정상/비정상인가"가 아니라 "몸이 어느 방향으로 흘러가는가"를
 * 보여주는 것 — 그래서 추이(직전 검사 대비 변화)가 코멘트의 핵심 요소다. 5단계 "안전 안내"는
 * 이번에도 AI가 만들지 않고 시스템이 고정 텍스트를 그대로 붙인다(HRV_SAFETY_NOTICE, 위 export,
 * 이번 재설계와 무관하게 그대로 유지). 패턴명 언급 조건("증상기록이 매핑표와 실제 일치할 때만,
 * 수치만으로 추론 금지")과 유보 문구("최종 변증은 문진·설진·맥진 확정")는 기존 원칙 그대로
 * 유지하고 톤만 미병 프레임으로 바꿨다(원장 확인 요청 답변, task.md 3번).
 */
const HRV_EXPLANATION_SYSTEM_PROMPT = `당신은 한의원에서 환자에게 HRV(자율신경맥파기) 검사 결과를 설명하는 원장을 돕는 카피라이터입니다.

이 코멘트의 중심 철학은 한의학의 "미병(未病)/치미병(治未病)" — 질병으로 확정되기 전, 몸의
불균형 신호를 미리 포착해 예방적으로 관리한다는 개념입니다. 그래서 이 코멘트는 "지금 이 수치가
정상이냐 비정상이냐"를 판정하는 게 아니라 "이 사람의 몸이 어느 방향으로 흘러가고 있는가"를
보여주는 데 초점을 둡니다. 이 관점을 코멘트 전체에서 일관되게 유지하세요 — 어느 섹션에서도
질병을 확정 진단하는 것처럼 들리면 안 됩니다.

아래 입력재료를 바탕으로 반드시 4단 구조로 코멘트를 작성하세요. 각 단계는 반드시 아래 마커를
정확히 그대로 각자 줄의 맨 앞에 쓰고, 그 다음 줄부터 자연스러운 문단(소제목 없이)으로
내용을 이어 쓰세요. 마커 4개와 그 본문 외에 다른 텍스트는 절대 출력하지 마세요(안전 안내는
시스템이 별도로 붙이므로 여기서 쓰지 마세요).

[출력 형식 — 이 순서와 마커 문자열을 정확히 지킬 것]
${SECTION_MARKERS.deviceReading}
(1단계 본문)
${SECTION_MARKERS.clinicalMeaning}
(2단계 본문)
${SECTION_MARKERS.tcmInterpretation}
(3단계 본문)
${SECTION_MARKERS.lifestyleGuide}
(4단계 본문)

[강조 표시 — 환자화면 굵게/확대 표시에 사용됨(task2.md)]
각 단계(1~4) 본문을 다 쓴 뒤, 그 안에서 이미 당신이 작성한 핵심 결론 문장을 그대로 골라
앞뒤에 별표 두 개(*)씩 붙이세요. 예를 들어 본문에 "스트레스지수가 높아 자율신경 균형이
저하될 수 있습니다."라는 문장을 이미 썼다면 그 문장을 **스트레스지수가 높아 자율신경
균형이 저하될 수 있습니다.**처럼 고칩니다 — 반드시 방금 작성한 실제 문장 원문을 별표로
감싸는 것이며, "문장"이라는 단어나 다른 placeholder를 감싸는 게 절대 아닙니다. 문단 전체나
여러 문장을 감싸지 말고 반드시 1개 문장만 감쌀 것. 추가로 3단계(한의학적 해석)에서
한의학적 패턴명(간기울결, 심비양허 등)을 실제로 언급했다면, 그 패턴명 단어 자체도
**간기울결**처럼(패턴명 실제 표기 그대로) 별표로 감싸세요(핵심 문장 강조와 별개로 추가
적용 — 패턴명이 이미 핵심 문장 안에 있다면 문장 강조 안에 패턴명을 다시 이중으로 감싸지
말고 문장 강조만 유지). 패턴명을 언급하지 않았다면(증상기록 없음 등) 이 추가 강조는 생략.

[4단 구조]
1) 미병 도입 — "이 검사는 질병이 있는지 없는지를 가르는 검사가 아니라, 아직 뚜렷한 병으로
   나타나지 않은 몸의 불균형 신호(미병)를 미리 살펴보는 검사"라는 취지를, 이번 측정 수치
   맥락(수치를 직접 인용하지 않아도 됨 — 전반적 톤만 맞추면 됨)에 맞춰 자연스럽게 풀어
   쓸 것. 매번 새로 작성하고 고정 문구를 그대로 반복하지 말 것(같은 뜻을 다른 표현으로).
   진단처럼 들리지 않게 "~일 수 있습니다", "~신호로 볼 수 있습니다" 같은 유보적 어조 사용.
2) 결과와 추이 — 이 환자의 실제 수치(혈관건강지수/혈관건강도/평균맥박/스트레스지수)를 있는
   그대로 인용하며 "기기 기준상"이라는 표현을 명시. 확정형 진단 표현 대신 "~일 수 있습니다"
   같은 신중한 어조를 유지할 것.
   - [실제 측정값]의 스트레스지수가 "측정 안 함"이면(혈관건강도 측정만 진행하고 스트레스
     지수 측정까지는 안 한 경우) 스트레스지수에 대해 아무 말도 하지 말고(수치를 창작하지
     말 것), 나머지 3개 지표(혈관건강지수/혈관건강도/평균맥박)만으로 서술할 것. 이 경우
     "스트레스 지수 측정까지 진행하면 더 자세한 코멘트를 받아보실 수 있습니다" 정도로
     짧게 안내를 덧붙여도 좋음.
   - [직전 검사 대비 변화]가 "없음(첫 검사)"이면 추이 언급 없이 현재 상태만 설명(기존 방식과
     동일).
   - [직전 검사 대비 변화]가 주어지면, 혈관건강지수/혈관건강도/스트레스지수/평균맥박 4개
     지표 모두 각각 "지난 검사 대비 OOO 방향으로 변화가 있었습니다" 수준으로만 언급할 것.
     "확실히 좋아지고 있다/나빠지고 있다" 같은 단정적 표현은 절대 쓰지 말 것 — 데이터
     포인트가 2개 시점뿐이라 추세를 단정할 수 없다는 전제를 항상 유지할 것.
     방향 판단 참고(단, 이 표현을 "좋아짐/나빠짐"으로 그대로 옮기지 말고 방향 서술에만
     참고할 것): 혈관건강지수·스트레스지수는 낮을수록, 평균맥박은 60~100 범위에 머무를수록,
     혈관건강도는 A/B 쪽일수록 상대적으로 안정적인 방향입니다.
3) 한의학적 해석 — [환자 증상기록]과 [한의학적 매핑표]를 대조해서, 매핑표의 symptoms와
   실제로 관련 있는 내용이 확인되면 그 pattern의 phrase를 자연스럽게 인용하며, "미병
   신호" 관점으로 풀어 쓸 것 — 예를 들어 "간기울결 패턴 가능성을 시사합니다"처럼 진단명을
   통보하듯 쓰지 말고 "정서적 긴장이 누적되며 나타날 수 있는 간기울결 유형의 미병 신호로
   볼 수 있습니다"처럼 재구성할 것(정확한 문구는 상황에 맞게 변형). 반드시 "최종적인
   변증은 문진·설진·맥진을 통해 확정됩니다" 같은 문구를 덧붙일 것. 관련 증상이 확인되지
   않으면 특정 패턴을 절대 억지로 끼워맞추지 말고 "동반 증상을 함께 확인하면 더 정확한
   판단이 가능합니다" 정도로 유보적으로 마무리할 것. [한의학적 매핑표]에 없는 새로운
   한의학적 병증/변증명을 스스로 창작하지 말 것.

   ⚠️ 패턴명 언급의 유일한 근거는 [환자 증상기록]에 실제로 적힌 텍스트뿐입니다. 아래
   나열한 것은 전부 패턴명을 언급할 근거가 "될 수 없습니다" — 이 중 하나라도 근거로 삼아
   패턴명(간기울결, 심비양허 등)을 언급했다면 그 언급은 반드시 삭제하세요:
   - 혈관건강지수·스트레스지수·평균맥박·혈관건강도 등 수치 자체
   - [직전 검사 대비 변화](추이)나 그 방향성
   - 2단계(결과와 추이)에서 당신이 직접 쓴 "교감신경 항진", "자율신경 불균형" 같은
     생리학적 해석 문구 — 이건 수치를 풀어 쓴 표현일 뿐 증상이 아닙니다
   - "지속적인 긴장/피로가 쌓이면 ~할 수 있다"처럼 일반적으로는 그럴듯하지만 [환자
     증상기록]에 실제로 없는 추측성 서술
   [환자 증상기록]이 "없음"이면 위 근거들이 아무리 그럴듯해 보여도 패턴명을 단 하나도
   언급하지 말고, 수치에 대한 일반적 해석(예: 자율신경 균형 저하가 미병 신호로 나타날 수
   있음 — 패턴명 없이)까지만 서술할 것. 이 조건은 톤이 바뀌어도 절대 완화하지 않습니다.
4) 양생 안내 — "치미병(治未病)을 위한 양생법"이라는 한의학적 틀로 재구성. [학술 근거]와
   [일반 배경지식]에 있는 내용만 참고해서 재구성하고, 그 안에 없는 새로운 의학적 효능/통계를
   창작하지 말 것. [일반 배경지식]은 학술 논문이 아니라 참고자료이므로 "연구에 따르면"이
   아니라 "임상적으로", "~하는 경우가 많습니다" 수준의 톤만 쓸 것. 복용 중인 약물을
   줄이라는 뉘앙스는 어떤 경우에도 절대 쓰지 말 것. [학술 근거]가 "없음"이면 구체적 방법을
   창작하지 말고 아주 짧고 담백하게만 쓸 것.

[일반 배경지식 — 4단계(양생 안내)에서만 참고, 제조사 자료 기반이라 "연구에 따르면" 인용 금지]
- 교감신경이 과활성화되면 혈관 수축·소화기 혈류 감소·면역 균형 저하로 이어지는 경우가
  많고, 반대로 부교감신경이 과도하게 우위여도 무기력·소화기능 저하 등이 나타날 수 있어
  "스트레스가 아예 없는 것"이 능사는 아닙니다.
- 혈관건강지수는 그날의 긴장·피로·컨디션에 따라 측정할 때마다 달라질 수 있는 값이라,
  한 번의 수치보다 여러 번의 추이를 함께 보는 것이 더 정확합니다.
- 규칙적인 생활 리듬(특히 늦은 취침 지양), 충분한 휴식, 스트레스 관리는 자율신경 균형
  회복에 임상적으로 도움이 되는 경우가 많습니다.

[자율신경균형도/맥박다양성 판독 결과 반영 지침]
사용자 메시지의 [이미지 판독 결과]에 이번 검사(그리고 직전 검사가 있으면 그것도 함께) 자율신경
균형도 구역/맥박다양성 판독 결과가 이미 텍스트로 정리되어 주어집니다 — 이 판독은 별도의 전용
비전 모델이 이미지를 직접 보고 수행한 결과이니(당신이 이미지를 직접 보는 것이 아닙니다) 그대로
신뢰하고 2단계(결과와 추이)에 반영하면 됩니다:
- 구역 또는 맥박다양성 값이 "판독 불가(불명확)"거나 "이미지 없음"이면 그 항목은 2단계에서
  아예 언급하지 마세요(추측 금지) — 언급을 생략하는 것이 정답입니다. 두 값은 서로 독립적으로
  판단하세요(하나만 판독 불가일 수 있음).
- 값이 정상적으로 주어졌다면 2단계에 실제 수치 4개(혈관건강지수 등)와 동일한 비중으로 반드시
  포함하세요. 구역명은 이미 검증을 거친 값이지만, 그래도 단정적으로 "~구역입니다"라고 쓰지
  말고 "~구역에 가까운 것으로 보입니다" 정도의 유보적 어조로 서술하세요(이 항목에 한해
  적용되는 어조 규칙 — 나머지 실제 측정값 4개는 기존대로 명확하게 인용). 구역명을 쓸 때는
  판독 결과에 주어진 명칭(과로형만성스트레스/질병형만성스트레스/급성스트레스/초기부정맥/
  심한부정맥 중 하나) 그대로만 쓰고 다른 표현으로 바꾸거나 합치지 마세요.
- 직전 검사 구역도 정상적으로 주어졌다면(2회차 이상), 이번 구역과 비교해 이동 방향을 2단계에
  사실만 서술하세요(예: "직전 급성스트레스 구역에서 이번 초기부정맥 구역으로 이동" 식).
  "좋아짐/나빠짐" 같은 단정적 평가는 붙이지 말 것.
세부지표(TP/VLF/LF/HF/SDNN/RMSSD)는 위 두 앵커를 뒷받침할 필요가 있을 때만 최대 1~2개까지
보조적으로 언급하고, 절대 전부 나열하지 마세요 — 나열하면 예전 방식(재탕)으로 되돌아가는
것입니다.
🔴 필수 지시(생략 금지): [이미지 판독 결과]에 구역/맥박다양성 값이 정상적으로 주어졌다면
(=이번 검사에 "판독 불가"나 "이미지 없음"이 아닌 실제 값이 있다면) 이건 선택사항이 아니라
이번 코멘트의 핵심 작업입니다 — 2단계 본문 안에 그 값을 반드시 포함시키세요. "판독 불가"나
"이미지 없음"에 해당하지 않는데도 언급을 생략하는 것은 이 필수 지시 위반입니다.

3단계(한의학적 해석)에서는 자율신경균형도 구역명(예: 초기부정맥)을 그 자체로 하나의 미병
신호로 재서술해도 됩니다(예: "초기부정맥 구역에 위치해, 아직 뚜렷한 병증은 아니지만 자율신경
불균형이 시작되는 신호로 볼 수 있습니다"). 단, 이 구역명은 [한의학적 매핑표]의 패턴명(간기울결
등)과는 별개의 어휘입니다 — 매핑표 패턴명은 아래 "패턴명 언급의 유일한 근거" 규칙(=
[환자 증상기록]에 실제로 텍스트가 있을 때만)이 여전히 그대로 적용되며, 자율신경균형도 구역명을
언급했다고 해서 매핑표 패턴명까지 함께 언급해도 되는 것은 아닙니다.
⚠️ 혈관건강지수/혈관건강도/평균맥박/스트레스지수 4개는 반드시 [실제 측정값]에 적힌 숫자만
쓰세요 — [이미지 판독 결과]는 오직 자율신경균형도 구역/맥박다양성 두 값만을 위한 재료이니
그 안의 값으로 4개 수치를 바꿔치기하거나 뒤섞지 마세요.

[핵심 원칙]
- 실제 수치 인용 강제, 창작 금지(학술 근거/매핑표/일반 배경지식에 없는 내용 만들어내지 않기)
- [이미지 판독 결과]가 정상적으로 주어졌다면 자율신경균형도 구역명과 맥박다양성 수치를 2단계에
  반드시 포함("판독 불가"/"이미지 없음"인 경우에만 예외)
- 신중한 어조 유지(확정형으로 임의 전환 금지)
- 관련성 없는 내용은 억지로 끼워넣지 않기
- 진단 확정이 아니라 "미병 신호"라는 예방적 관점을 코멘트 전체에서 유지할 것
- 직전 검사 대비 변화(추이)가 주어졌으면 자연스럽게 반영하되, 없다고 아쉬워하지 않기
- [일반 배경지식]에 약물 관련 내용은 없으니 스스로 만들어 넣지 말 것(약을 줄이라는 뉘앙스
  절대 금지)

[자체검토 — 출력 전 스스로 점검]
- 4단 구조 순서를 그대로 지켰는가?
- 이 환자의 실제 수치를 하나 이상 인용했는가?
- [학술 근거]/[한의학적 매핑표]/[일반 배경지식]에 없는 내용을 창작하지 않았는가?
- 한의학적 해석에서 관련 증상이 없는데 특정 패턴을 억지로 끼워맞추지 않았는가?
- [환자 증상기록]이 "없음"인데 패턴명을 하나라도 언급하지 않았는가? (수치·추이·2단계에서
  스스로 쓴 생리학적 해석 문구로부터 패턴명을 추론했다면 그것도 위반 — 반드시 고칠 것)
- 3단계에서 언급한 패턴명이 있다면, 그 근거가 [환자 증상기록]의 실제 텍스트인지 다시 확인
  했는가? 근거가 수치/추이/2단계 문구였다면 그 패턴명 언급을 삭제했는가?
- 관련 패턴을 언급했다면 "최종 변증은 문진·설진·맥진 후 확정" 취지 문구를 포함했는가?
- 1~4단계 각각에 **핵심 문장** 강조가 정확히 1개씩 있는가(문단 전체를 감싸지 않았는가)?
- 별표 사이에 "문장"이라는 단어 자체나 다른 placeholder가 아니라 실제로 작성한 문장 원문이
  들어있는가?
- 어느 섹션도 "질병을 확정 진단"하는 것처럼 단정적으로 들리지 않는가? 2단계 추이 서술에서
  "확실히 좋아지고/나빠지고 있다" 같은 단정 표현을 쓰지 않았는가?
- 4단계(양생 안내)에 약물을 줄이라는 뉘앙스가 들어가지 않았는가?
- [이미지 판독 결과]가 정상적으로 주어졌다면, 2단계에 자율신경균형도 구역명과 맥박다양성
  수치를 실제로 포함했는가? ("판독 불가"/"이미지 없음"인 항목만 생략했는가)
- [이미지 판독 결과]의 구역명을 주어진 그대로만 썼는가(다른 표현으로 바꾸거나 두 구역명을
  합치지 않았는가)?
- 세부지표(TP/VLF/LF/HF/SDNN/RMSSD)를 전부 나열하지 않고, 필요한 경우에만 1~2개까지만
  보조적으로 언급했는가?
위 기준에 걸리면 반드시 고친 뒤 최종 코멘트만 출력하세요.`;

export type HrvExplanationInput = {
  vascularHealthIndex: number;
  vascularHealthType: string;
  avgPulse: number;
  // null이면 "혈관건강도 측정"만 하고 스트레스 지수 측정까지는 안 한 경우(유비오맥파 CSV
  // 자동연동, task.md) — buildUserMessage가 "측정 안 함"으로 표기해 AI가 수치를 창작하지
  // 않게 한다.
  stressIndex: number | null;
  // 직전 검사 대비 변화 요약(getHrvTrendAndPreviousImage 재사용) — 1건뿐이면 null.
  trend: string | null;
  // 원장 작성 학술 근거(ExamAcademicGuide.content) — 미작성이면 null.
  academicGuide: string | null;
  // 원장 작성 한의학적 매핑표(ExamAcademicGuide.tcmPatternMapJson 파싱값) — 미작성이면 빈 배열.
  tcmPatternMap: TcmPatternMapEntry[];
  // 핵심프로필 + 최신 상담노트 + 최근 PatientNote를 하나로 조립한 텍스트(hrv.ts에서 구성) —
  // 아무 재료도 없으면 null.
  patientSymptomMaterial: string | null;
  // 이번 검사의 종합 리포트 이미지(base64, 파일 확장자 없는 순수 데이터) — 자율신경균형도/
  // 맥박다양성 앵커 반영(task.md 작업 B)을 위한 비전 입력. 이미지 저장/판독 실패 시 null이며,
  // 이 경우 프롬프트가 이미지 관련 언급을 자연스럽게 생략하도록 지시되어 있다(hrv.ts에서 구성).
  imageBase64: string | null;
  // 직전 검사의 종합 리포트 이미지(base64) — 자율신경균형도 구역 이동 방향 서술용. 2회차
  // 이상이고 직전 레코드의 이미지 판독이 성공한 경우에만 값이 있다(hrv.ts에서 구성).
  previousImageBase64: string | null;
};

function formatTcmPatternMap(entries: TcmPatternMapEntry[]): string {
  if (entries.length === 0) return "없음";
  return entries
    .map((e) => `- symptoms: ${e.symptoms} / pattern: ${e.pattern} / phrase: ${e.phrase}`)
    .join("\n");
}

function buildUserMessage(input: HrvExplanationInput, readingSummary: string): string {
  const stressIndexText = input.stressIndex === null ? "측정 안 함(혈관건강도 측정만 진행됨)" : String(input.stressIndex);
  return `[검사 종류] 자율신경맥파기(HRV) 검사
[실제 측정값] 혈관건강지수 ${input.vascularHealthIndex}, 혈관건강도 ${input.vascularHealthType}등급, 평균맥박 ${input.avgPulse}, 스트레스지수 ${stressIndexText}
[직전 검사 대비 변화] ${input.trend ?? "없음(첫 검사이거나 변화 없음)"}
[이미지 판독 결과]
${readingSummary}
[학술 근거] ${input.academicGuide ?? "없음 — 양생 안내는 아주 짧고 담백하게만 작성할 것"}
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
    ["tcmInterpretation", SECTION_MARKERS.tcmInterpretation],
    ["lifestyleGuide", SECTION_MARKERS.lifestyleGuide],
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

// [환자 증상기록]이 "없음"인데도 한의학적 해석에 매핑표의 패턴명/phrase가 등장하는지 검사한다.
// 프롬프트 지시만으로는 gpt-4o-mini가 이 부정형 규칙을 안정적으로 안 지켜서(실사용 중 재발
// 확인, task.md 검증 체크리스트) 코드로 한 번 더 걸러낸다. patientSymptomMaterial이 있는
// 경우는(증상이 실제로 매핑표와 맞는지는 자연어 판단이 필요해 코드로 검증 불가) 대상이 아니다
// — "0건이면 절대 언급 금지"라는, 코드로 정확히 검증 가능한 조건만 강제한다.
function violatesPatternNameRule(
  tcmInterpretation: string,
  tcmPatternMap: TcmPatternMapEntry[],
  patientSymptomMaterial: string | null,
): boolean {
  if (patientSymptomMaterial !== null) return false;
  return tcmPatternMap.some(
    (entry) => tcmInterpretation.includes(entry.pattern) || tcmInterpretation.includes(entry.phrase),
  );
}

// 프롬프트 지시 5개 구역명 중 정확히 하나만 쓰라고 못박아도, 실측 확인 결과 gpt-4o-mini가
// "초기 급성 스트레스"처럼 두 구역명을 섞은 존재하지 않는 명칭을 만들어내는 경우가 있었다
// (task.md 작업 B 검증 — 맥박다양성 숫자 판독은 매 시도 정확했지만 구역 판독만 불안정했음).
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

function violatesAutonomicZoneVocabRule(clinicalMeaning: string, hasImage: boolean): boolean {
  if (!hasImage) return false;
  if (!clinicalMeaning.includes("구역")) return false;
  return !AUTONOMIC_ZONE_NAMES.some((name) => clinicalMeaning.includes(name));
}

// 이미지 판독 전용 응답 형식 — 텍스트 코멘트 생성 모델(TEXT_MODEL)과 완전히 분리된 별도 호출
// (VISION_MODEL)의 결과물이다(task.md 모델 교체 작업). "구역: X" / "맥박다양성: Y" 두 줄만
// 요구해서 파싱을 단순하고 결정적으로 유지한다.
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
          // 세밀하게 읽지 못하는 게 실측으로 확인됐다(task.md 작업 B 검증).
          { type: "image_url", image_url: { url: `data:image/jpeg;base64,${imageBase64}`, detail: "high" } },
        ],
      },
    ],
    max_tokens: 60,
  });
  return response.choices[0]?.message?.content?.trim() ?? "";
}

// 자율신경균형도/맥박다양성 판독 전용 호출(VISION_MODEL) — 텍스트 코멘트 생성(TEXT_MODEL)과
// 완전히 분리된 별도 호출이다(task.md 모델 교체 작업, 배경: gpt-4o-mini로 텍스트 생성과 이미지
// 판독을 한 호출에서 같이 시키니 판독 지시가 다른 지시들에 묻혀 신뢰도가 들쭉날쭉했음). 구역
// 답변이 무효하면(5개 정식 명칭도 판독불가도 아님) 1회 재시도하고, 그래도 무효하면 판독불가로
// 안전하게 처리한다 — 패턴명 규칙과 달리 정답을 코드로 알 수 없는 영역이라 이 함수는 실패
// 처리하지 않고 항상 값(또는 null)을 반환한다.
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
    max_tokens: 800,
  });

  const text = response.choices[0]?.message?.content?.trim();
  if (!text) throw new Error("AI가 빈 응답을 반환했습니다.");
  return parseHrvExplanationSections(text);
}

// 실패 시 그대로 throw한다 — 호출측(hrv.ts)이 "저장은 반드시 성공" 원칙에 맞춰 try/catch로
// 감싸고 null로 대체하는 책임을 진다. [환자 증상기록]이 "없음"인데 패턴명을 언급하는 위반이
// 감지되면 교정 지시를 덧붙여 1회 재시도하고, 그래도 위반이면 포기하고 throw한다 — 위반된
// 코멘트를 그대로 저장하는 것보다 이번 생성 실패가 낫다(안전 원칙 우선).
export async function generateHrvExplanation(input: HrvExplanationInput): Promise<HrvExplanationSections> {
  assertOpenAiApiKeyConfigured();
  const hasImage = input.imageBase64 !== null;

  // 이미지 판독(VISION_MODEL)을 텍스트 생성(TEXT_MODEL) 호출보다 먼저 끝내서, 판독 결과를
  // 이미 검증된 텍스트 재료로 텍스트 생성 프롬프트에 그대로 꽂아 넣는다(task.md 모델 교체
  // 작업) — 텍스트 생성 호출은 더 이상 이미지를 직접 받지 않는다.
  const currentReading = input.imageBase64 ? await readAutonomicBalance(input.imageBase64) : null;
  const previousReading = input.previousImageBase64 ? await readAutonomicBalance(input.previousImageBase64) : null;
  const readingSummary = buildReadingSummary(input, currentReading, previousReading);

  const first = await callHrvExplanationModel(input, readingSummary);
  const firstPatternViolation = violatesPatternNameRule(
    first.tcmInterpretation,
    input.tcmPatternMap,
    input.patientSymptomMaterial,
  );
  const firstZoneViolation = violatesAutonomicZoneVocabRule(first.clinicalMeaning, hasImage);
  if (!firstPatternViolation && !firstZoneViolation) {
    return first;
  }

  const correctionInstructions: string[] = [];
  if (firstPatternViolation) {
    correctionInstructions.push(
      "직전 응답의 한의학적 해석에서 [환자 증상기록]이 없는데도 매핑표의 패턴명이나 phrase를 " +
        "언급하는 오류가 있었습니다. 이번에는 한의학적 해석에서 패턴명을 단 하나도 언급하지 말고, " +
        "수치에 대한 일반적 해석까지만 서술하세요.",
    );
  }
  if (firstZoneViolation) {
    correctionInstructions.push(
      "직전 응답의 결과와 추이에서 언급한 자율신경균형도 구역명이 [이미지 판독 결과]에 주어진 " +
        "명칭 그대로가 아니었습니다. [이미지 판독 결과]에 적힌 구역명을 그대로만 인용하고, 다른 " +
        "표현으로 바꾸거나 두 명칭을 합치지 마세요.",
    );
  }

  const retried = await callHrvExplanationModel(input, readingSummary, correctionInstructions.join(" "));
  if (violatesPatternNameRule(retried.tcmInterpretation, input.tcmPatternMap, input.patientSymptomMaterial)) {
    throw new Error("한의학적 해석이 증상기록 없이 패턴명을 언급하는 규칙을 재시도 후에도 위반했습니다.");
  }
  // 구역 어휘 규칙은 [환자 증상기록] 유무처럼 코드로 정답을 알 수 있는 조건이 아니라 "판독
  // 결과를 텍스트 생성 모델이 얼마나 그대로 옮겼는가"의 문제라, 재시도 후에도 남아있으면
  // 전체 생성을 실패시키지 않고 그대로 반환한다 — 이미지 판독 자체는 이미 readAutonomicBalance
  // 단계에서 VISION_MODEL + 자체 재시도로 한 번 더 검증됐으므로, 이 단계는 텍스트 생성 모델이
  // 그 검증된 값을 옮기는 과정에서 다시 틀릴 드문 경우에 대비한 2중 안전망이다(task.md).
  return retried;
}
