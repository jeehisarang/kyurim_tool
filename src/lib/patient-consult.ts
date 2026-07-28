import { prisma } from "@/lib/db";
import { createWorkTask } from "@/lib/work-tasks";
import { WORK_TASK_TYPE } from "@/lib/task-types";
import { startOfDay, getSystemStaffUserId } from "@/lib/teaching-pages";

// 환자 대면 페이지 하단 고정 CTA(task3.md) — 기존에 프로그램문의하기/이벤트문의하기/
// 검사상담요청 3개로 나뉘어 있던 콜백 업무 생성 로직을 하나로 통일한다. 어느 페이지
// (/p/[token] 프로그램티칭 / /s/[token] 통합공유의 이벤트·검사 섹션)에서 눌렀든 업무
// 제목은 항상 이 마커를 포함해, 같은 환자가 당일 이미 문의를 남겼으면 페이지를 오가며
// 눌러도 중복 생성되지 않는다(환자에게 보이는 버튼/문구도 항상 "진료상담문의하기" 하나로
// 통일 — 페이지별로 달랐던 기존 문구는 폐기).
const CONSULT_WORK_TITLE_MARKER = "진료상담 문의";

export async function requestPatientConsultCallback(input: {
  patientId: number;
  patientName: string;
  // 담당 직원이 어디서 온 문의인지 참고할 수 있게 업무 설명(description)에만 남긴다 —
  // 환자에게 노출되는 버튼/문구와는 무관.
  sourceLabel: string;
}): Promise<void> {
  const existingOpen = await prisma.todoTask.findFirst({
    where: {
      taskType: WORK_TASK_TYPE,
      patientId: input.patientId,
      isDone: false,
      createdAt: { gte: startOfDay(new Date()) },
      workTask: { title: { contains: CONSULT_WORK_TITLE_MARKER } },
    },
  });
  if (existingOpen) return;

  const systemStaffId = await getSystemStaffUserId();
  await createWorkTask({
    title: `${input.patientName}님 ${CONSULT_WORK_TITLE_MARKER} — 연락 필요`,
    description: input.sourceLabel,
    creatorId: systemStaffId,
    isSharedTask: true,
    dueDate: null,
    patientId: input.patientId,
  });
}
