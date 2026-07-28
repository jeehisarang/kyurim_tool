import { NextResponse } from "next/server";
import {
  getMissionSubmissionByToken,
  submitMissionQuizAnswer,
  submitMissionPhoto,
  submitMissionText,
  MissionAlreadyProcessedError,
  MissionSubmissionNotFoundError,
  MISSION_TYPE_QUIZ,
  MISSION_TYPE_PHOTO,
  MISSION_TYPE_TEXT,
} from "@/lib/missions";
import { ImageResizeError } from "@/lib/image-upload";

// 미션 제출(/api/missions/[token]/submit, task.md 2-2) — 인증 없음(공개 링크). 폼 형식은
// FormData 고정(사진 업로드를 포함해야 하는 PHOTO 타입과 필드 형식을 통일하기 위함).
// 실제 처리 분기는 URL의 token이 가리키는 제출건의 미션 타입을 서버가 직접 확인해서
// 결정한다(클라이언트가 보낸 타입을 신뢰하지 않음).
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const submission = await getMissionSubmissionByToken(token);
  if (!submission) {
    return NextResponse.json({ error: "미션을 찾을 수 없습니다." }, { status: 404 });
  }

  const formData = await request.formData();
  // 템플릿 스냅샷 구조(task.md) — 이 토큰이 생성된 시점의 템플릿 유형을 기준으로 분기한다
  // (오늘의 미션이 그 뒤에 재지정되어도 이 값은 절대 바뀌지 않는다).
  const missionType = submission.missionTemplate.type;

  try {
    if (missionType === MISSION_TYPE_QUIZ) {
      const selectedIndex = Number(formData.get("selectedIndex"));
      if (!Number.isInteger(selectedIndex)) {
        return NextResponse.json({ error: "보기를 선택해주세요." }, { status: 400 });
      }
      const result = await submitMissionQuizAnswer(token, selectedIndex);
      return NextResponse.json(result);
    }

    if (missionType === MISSION_TYPE_PHOTO) {
      const photo = formData.get("photo");
      if (!(photo instanceof File) || photo.size === 0) {
        return NextResponse.json({ error: "사진을 첨부해주세요." }, { status: 400 });
      }
      const updated = await submitMissionPhoto(token, photo);
      return NextResponse.json(updated);
    }

    if (missionType === MISSION_TYPE_TEXT) {
      const text = String(formData.get("text") ?? "").trim();
      if (!text) {
        return NextResponse.json({ error: "내용을 입력해주세요." }, { status: 400 });
      }
      const updated = await submitMissionText(token, text);
      return NextResponse.json(updated);
    }

    return NextResponse.json({ error: "지원하지 않는 미션 유형입니다." }, { status: 400 });
  } catch (err) {
    if (err instanceof MissionAlreadyProcessedError || err instanceof MissionSubmissionNotFoundError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    if (err instanceof ImageResizeError) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    throw err;
  }
}
