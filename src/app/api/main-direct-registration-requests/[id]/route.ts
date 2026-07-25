import { NextResponse } from "next/server";
import { updateMainDirectRegistrationStatus, InvalidMainDirectRegistrationStatusError } from "@/lib/referrals";

// 처리상태 수기 변경(task.md) — PENDING/CONTACTED/CONVERTED/NOT_CONVERTED.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));

  try {
    const updated = await updateMainDirectRegistrationStatus(Number(id), body.status);
    return NextResponse.json(updated);
  } catch (err) {
    if (err instanceof InvalidMainDirectRegistrationStatusError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}
