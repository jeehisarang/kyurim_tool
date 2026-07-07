import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

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
    include: { staffUser: true },
  });

  return NextResponse.json(note, { status: 201 });
}
