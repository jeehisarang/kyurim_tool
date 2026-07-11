import { prisma } from "@/lib/db";

export async function listEventImages() {
  return prisma.eventImage.findMany({
    orderBy: { id: "desc" },
    include: { createdByStaff: { select: { id: true, name: true } } },
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

export async function setEventImageActive(id: number, isActive: boolean) {
  return prisma.eventImage.update({ where: { id }, data: { isActive } });
}
