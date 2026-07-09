import { prisma } from "@/lib/db";

// 설정 화면(원장 전용)에서 전체(활성+비활성) 조회.
export async function listAnnouncements() {
  return prisma.announcement.findMany({
    include: { createdBy: true },
    orderBy: { id: "desc" },
  });
}

// 홈 화면 노출용 — isActive=true AND startDate <= referenceDate AND
// (endDate가 null이거나 endDate >= referenceDate).
export async function listActiveAnnouncements(referenceDate: Date) {
  return prisma.announcement.findMany({
    where: {
      isActive: true,
      startDate: { lte: referenceDate },
      OR: [{ endDate: null }, { endDate: { gte: referenceDate } }],
    },
    include: { createdBy: true },
    orderBy: { startDate: "desc" },
  });
}

export async function createAnnouncement(input: {
  title: string;
  content: string;
  startDate: Date;
  endDate: Date | null;
  createdById: number;
}) {
  return prisma.announcement.create({
    data: input,
    include: { createdBy: true },
  });
}

export async function updateAnnouncement(
  id: number,
  input: {
    title?: string;
    content?: string;
    startDate?: Date;
    endDate?: Date | null;
    isActive?: boolean;
  },
) {
  return prisma.announcement.update({
    where: { id },
    data: input,
    include: { createdBy: true },
  });
}

// 하위 참조 테이블이 없어 WorkTask/검사기록과 동일하게 하드 삭제한다.
export async function deleteAnnouncement(id: number) {
  await prisma.announcement.delete({ where: { id } });
}
