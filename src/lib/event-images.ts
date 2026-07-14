import { prisma } from "@/lib/db";
import { logActivity } from "@/lib/activity-log";
import { withObjectParticle } from "@/lib/korean-particle";
import { createWorkTask } from "@/lib/work-tasks";
import { WORK_TASK_TYPE } from "@/lib/task-types";
import { startOfDay, getSystemStaffUserId } from "@/lib/teaching-pages";

export async function listEventImages() {
  return prisma.eventImage.findMany({
    orderBy: { id: "desc" },
    include: { createdByStaff: { select: { id: true, name: true } } },
  });
}

// 공유링크 패널(14-11)의 이벤트 드롭다운용 — 비활성화(isActive: false)된 이벤트는 이미
// 종료된 이벤트라 새 공유링크에 노출하지 않는다.
export async function listActiveEventImages() {
  return prisma.eventImage.findMany({
    where: { isActive: true },
    orderBy: { id: "desc" },
  });
}

export async function createEventImage(input: {
  rawIdea: string;
  finalTitle: string;
  finalCopy: string;
  backgroundImagePath: string;
  compositeImagePath: string;
  createdByStaffId: number;
}) {
  return prisma.eventImage.create({
    data: input,
    include: { createdByStaff: { select: { id: true, name: true } } },
  });
}

export async function getEventImage(id: number) {
  return prisma.eventImage.findUnique({ where: { id } });
}

export async function updateEventImage(
  id: number,
  input: Partial<{
    rawIdea: string;
    finalTitle: string;
    finalCopy: string;
    backgroundImagePath: string;
    compositeImagePath: string;
    isActive: boolean;
  }>,
) {
  return prisma.eventImage.update({
    where: { id },
    data: input,
    include: { createdByStaff: { select: { id: true, name: true } } },
  });
}

// 완전 삭제(task.md) — 비활성화(소프트 삭제)와 별개의 더 강한 액션. DB 레코드만 지우고,
// 실제 파일 정리는 호출측(API route)이 삭제 전 조회해둔 경로로 처리한다.
export async function deleteEventImage(id: number) {
  return prisma.eventImage.delete({ where: { id } });
}

/**
 * "이벤트문의하기" 버튼 클릭 로그(task.md, /s/[token] 이벤트 섹션) — 티칭지의
 * recordTeachingPageCtaClick과 동일하게 중복 방지 없이 클릭마다 기록한다(업무 중복 방지는
 * requestEventInquiryCallback이 별도로 처리). PatientShareLink 토큰으로 환자+이벤트를
 * 함께 조회한다 — EventImage 자체는 티칭지처럼 고유 공개 token을 갖지 않고 공유링크를
 * 통해서만 노출되기 때문.
 */
export async function recordEventCtaClick(shareToken: string): Promise<boolean> {
  const link = await prisma.patientShareLink.findUnique({
    where: { token: shareToken },
    include: { patient: true, eventImage: true },
  });
  if (!link || !link.eventImage) return false;

  await logActivity({
    actorType: "PATIENT",
    actorId: link.patientId,
    actionType: "EVENT_CTA_CLICK",
    label: `${link.patient.name}님이 [${link.eventImage.finalTitle}] ${withObjectParticle("이벤트문의하기")} 눌렀습니다`,
  });
  return true;
}

/**
 * "이벤트문의하기" 버튼(task.md, /s/[token] 공개 페이지) — requestConsultCallback과 동일한
 * 패턴으로 콜백 업무(WORK)를 전체공통으로 자동 생성한다. 같은 환자에게 당일 이미
 * 열려있는(미완료) "이벤트문의" 콜백 업무가 있으면 새로 만들지 않는다.
 */
export async function requestEventInquiryCallback(shareToken: string): Promise<{ patientName: string } | null> {
  const link = await prisma.patientShareLink.findUnique({
    where: { token: shareToken },
    include: { patient: true, eventImage: true },
  });
  if (!link || !link.eventImage) return null;

  const existingOpen = await prisma.todoTask.findFirst({
    where: {
      taskType: WORK_TASK_TYPE,
      patientId: link.patientId,
      isDone: false,
      createdAt: { gte: startOfDay(new Date()) },
      workTask: { title: { contains: "이벤트문의 요청" } },
    },
  });

  if (!existingOpen) {
    const systemStaffId = await getSystemStaffUserId();
    await createWorkTask({
      title: `${link.patient.name}님 이벤트문의 요청 — 연락 필요`,
      description: `이벤트: ${link.eventImage.finalTitle}`,
      creatorId: systemStaffId,
      isSharedTask: true,
      dueDate: null,
      patientId: link.patientId,
    });
  }

  return { patientName: link.patient.name };
}
