// 완료/보류 처리 로직과 "오늘 할 일" 화면 분류의 기준이 되는 taskType 레지스트리.
// 순수 상수 모듈(서버 전용 의존성 없음) — 클라이언트 컴포넌트에서도 그대로 import 가능.
//
// 메시지형(MESSAGE_TASK_TYPES): 완료여부의 진실원천이 로그(MessageLog 또는
// ProgramEventLog)이고, 복사/발송확인/AI생성 UI를 가진다. patientId 직결(자가치유형 톡:
// DAY2/DAY7/THIRD_VISIT)과 prescriptionId 경유(프로그램 이벤트: TRIAL_*) 두 경로 모두 여기 속한다.
// 그 외(NEXT_DOSE/FOLLOW_UP)는 체크형 — TodoTask.isDone이 진실원천.
export const MESSAGE_TASK_TYPES = [
  "DAY2",
  "DAY7",
  "THIRD_VISIT",
  "TRIAL_WELCOME",
  "TRIAL_DAY2",
  "TRIAL_DEADLINE",
] as const;

export function isMessageTaskType(taskType: string): boolean {
  return (MESSAGE_TASK_TYPES as readonly string[]).includes(taskType);
}

// 업무/요청(직원이 직접 작성). 완료 로그가 따로 없는 체크형(NEXT_DOSE/FOLLOW_UP)과
// 동일하게 TodoTask.isDone이 진실원천이지만, patientId/prescriptionId 둘 다 없을 수
// 있어(자율업무/요청업무는 환자와 무관) 별도 분류가 필요하다.
export const WORK_TASK_TYPE = "WORK";

export function isWorkTaskType(taskType: string): boolean {
  return taskType === WORK_TASK_TYPE;
}
