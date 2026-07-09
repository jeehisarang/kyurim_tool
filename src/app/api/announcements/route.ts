import { NextResponse } from "next/server";
import { createAnnouncement, listActiveAnnouncements, listAnnouncements } from "@/lib/announcements";

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

// Visit.visitDate/examDate와 동일한 자정 정규화 원칙(YYYY-MM-DD를 로컬 자정으로 파싱).
function parseDate(value: unknown): Date | null | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, y, m, d] = match;
  return new Date(Number(y), Number(m) - 1, Number(d));
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const activeOnly = searchParams.get("activeOnly") === "1";

  if (activeOnly) {
    const dateParam = searchParams.get("date");
    const referenceDate = dateParam ? (parseDate(dateParam) ?? startOfToday()) : startOfToday();
    const rows = await listActiveAnnouncements(referenceDate);
    return NextResponse.json(rows);
  }

  const rows = await listAnnouncements();
  return NextResponse.json(rows);
}

export async function POST(request: Request) {
  const body = await request.json();
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const content = typeof body.content === "string" ? body.content.trim() : "";
  const createdById = Number(body.createdById);

  if (!title || !content || !createdById) {
    return NextResponse.json(
      { error: "제목, 내용, 작성자를 모두 입력하세요." },
      { status: 400 },
    );
  }

  const startDate = body.startDate === undefined ? startOfToday() : parseDate(body.startDate);
  if (startDate === null) {
    return NextResponse.json({ error: "시작일 형식이 올바르지 않습니다." }, { status: 400 });
  }
  const endDate = parseDate(body.endDate);
  if (endDate === null && body.endDate) {
    return NextResponse.json({ error: "종료일 형식이 올바르지 않습니다." }, { status: 400 });
  }

  const announcement = await createAnnouncement({
    title,
    content,
    startDate: startDate ?? startOfToday(),
    endDate: endDate ?? null,
    createdById,
  });
  return NextResponse.json(announcement, { status: 201 });
}
