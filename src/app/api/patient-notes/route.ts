import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logActivity } from "@/lib/activity-log";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const patientId = Number(searchParams.get("patientId"));

  if (!patientId) {
    return NextResponse.json({ error: "patientId가 필요합니다." }, { status: 400 });
  }

  const notes = await prisma.patientNote.findMany({
    where: { patientId },
    include: { staffUser: true },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(notes);
}

export async function POST(request: Request) {
  const body = await request.json();
  const { patientId, content, staffUserId } = body;

  if (!patientId || !content?.trim() || !staffUserId) {
    return NextResponse.json(
      { error: "patientId, content, staffUserId가 필요합니다." },
      { status: 400 },
    );
  }

  const note = await prisma.patientNote.create({
    data: {
      patientId: Number(patientId),
      content: content.trim(),
      staffUserId: Number(staffUserId),
    },
    include: { staffUser: true, patient: true },
  });

  // 메모 내용 자체는 프라이버시상 로그에 노출하지 않는다(task.md 지시) — 작성 사실만 기록.
  await logActivity({
    actorType: "STAFF",
    actorId: note.staffUserId,
    actionType: "PATIENT_NOTE_CREATE",
    label: `${note.staffUser.name}님이 ${note.patient.name}님에게 메모를 남겼습니다`,
  });

  return NextResponse.json(note, { status: 201 });
}
