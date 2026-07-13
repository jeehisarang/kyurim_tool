import crypto from "crypto";
import { prisma } from "@/lib/db";
import { getTeachingPageContentById, type TeachingPageContentForShare } from "@/lib/teaching-pages";
import { getEventImage } from "@/lib/event-images";

export type CreateShareLinkInput = {
  patientId: number;
  teachingPageId: number | null;
  eventImageId: number | null;
  createdByStaffId: number;
};

export class InvalidShareLinkComboError extends Error {
  constructor() {
    super("프로그램티칭 또는 이벤트 중 최소 하나는 선택해야 합니다.");
    this.name = "InvalidShareLinkComboError";
  }
}

/**
 * 이미 동일 조합(환자+티칭지+이벤트)의 링크가 있으면 그대로 재사용하고, 없으면 새로
 * 생성한다(task.md — 중복 생성 방지). teachingPageId/eventImageId 둘 다 null이면 애초에
 * 링크가 필요 없는 케이스이므로 서버단에서 막는다.
 */
export async function createOrReuseShareLink(input: CreateShareLinkInput) {
  if (input.teachingPageId === null && input.eventImageId === null) {
    throw new InvalidShareLinkComboError();
  }

  const existing = await prisma.patientShareLink.findFirst({
    where: {
      patientId: input.patientId,
      teachingPageId: input.teachingPageId,
      eventImageId: input.eventImageId,
    },
  });
  if (existing) return existing;

  return prisma.patientShareLink.create({
    data: {
      token: crypto.randomUUID(),
      patientId: input.patientId,
      teachingPageId: input.teachingPageId,
      eventImageId: input.eventImageId,
      createdByStaffId: input.createdByStaffId,
    },
  });
}

export type ShareLinkEventView = {
  finalTitle: string;
  compositeImagePath: string;
};

export type PublicShareLinkView = {
  teaching: TeachingPageContentForShare | null;
  event: ShareLinkEventView | null;
  viewCount: number;
};

/**
 * 공개 페이지(/s/{token}) 전용 조회 — 접속마다 PatientShareLink.viewCount +1, 최초
 * 접속이면 firstViewedAt만 1회 기록한다(getPublicTeachingPageByToken과 동일 패턴).
 */
export async function getShareLinkByToken(token: string): Promise<PublicShareLinkView | null> {
  const existing = await prisma.patientShareLink.findUnique({ where: { token } });
  if (!existing) return null;

  const updated = await prisma.patientShareLink.update({
    where: { id: existing.id },
    data: {
      viewCount: { increment: 1 },
      firstViewedAt: existing.firstViewedAt ?? new Date(),
    },
  });

  const [teaching, event] = await Promise.all([
    updated.teachingPageId ? getTeachingPageContentById(updated.teachingPageId) : null,
    updated.eventImageId ? getEventImage(updated.eventImageId) : null,
  ]);

  return {
    teaching,
    event: event ? { finalTitle: event.finalTitle, compositeImagePath: event.compositeImagePath } : null,
    viewCount: updated.viewCount,
  };
}
