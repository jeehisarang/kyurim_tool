import { prisma } from "@/lib/db";

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
