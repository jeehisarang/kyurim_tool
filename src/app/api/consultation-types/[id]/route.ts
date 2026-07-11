import { NextResponse } from "next/server";
import { updateConsultationType } from "@/lib/consultation-types";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json();

  const name = typeof body.name === "string" ? body.name.trim() : undefined;
  const sortOrder = typeof body.sortOrder === "number" ? body.sortOrder : undefined;
  const isActive = typeof body.isActive === "boolean" ? body.isActive : undefined;

  if (name !== undefined && name.length === 0) {
    return NextResponse.json({ error: "이름을 입력하세요." }, { status: 400 });
  }

  const type = await updateConsultationType(Number(id), {
    ...(name !== undefined ? { name } : {}),
    ...(sortOrder !== undefined ? { sortOrder } : {}),
    ...(isActive !== undefined ? { isActive } : {}),
  });
  return NextResponse.json(type);
}
