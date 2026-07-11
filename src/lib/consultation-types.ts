import { prisma } from "@/lib/db";

export async function listConsultationTypes() {
  return prisma.consultationType.findMany({ orderBy: { sortOrder: "asc" } });
}

export async function listActiveConsultationTypes() {
  return prisma.consultationType.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
  });
}

export async function createConsultationType(input: { name: string; sortOrder?: number }) {
  return prisma.consultationType.create({
    data: { name: input.name, sortOrder: input.sortOrder ?? 0 },
  });
}

export async function updateConsultationType(
  id: number,
  input: { name?: string; sortOrder?: number; isActive?: boolean },
) {
  return prisma.consultationType.update({ where: { id }, data: input });
}
