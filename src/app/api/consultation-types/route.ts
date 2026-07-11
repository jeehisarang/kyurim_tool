import { NextResponse } from "next/server";
import {
  createConsultationType,
  listActiveConsultationTypes,
  listConsultationTypes,
} from "@/lib/consultation-types";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const activeOnly = searchParams.get("activeOnly") === "1";
  const rows = activeOnly ? await listActiveConsultationTypes() : await listConsultationTypes();
  return NextResponse.json(rows);
}

export async function POST(request: Request) {
  const body = await request.json();
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "이름을 입력하세요." }, { status: 400 });
  }
  const sortOrder = typeof body.sortOrder === "number" ? body.sortOrder : undefined;

  const type = await createConsultationType({ name, sortOrder });
  return NextResponse.json(type, { status: 201 });
}
