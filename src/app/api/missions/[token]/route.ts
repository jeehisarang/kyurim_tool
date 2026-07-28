import { NextResponse } from "next/server";
import { getMissionSubmissionByToken, parseQuizOptions } from "@/lib/missions";
import { getOrIssueReferralTokenForPatient } from "@/lib/referrals";

// 미션 제출 페이지(/m/[token], task.md 3-4) — 인증 없음(공개 링크).
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const submission = await getMissionSubmissionByToken(token);
  if (!submission) {
    return NextResponse.json({ error: "미션을 찾을 수 없습니다." }, { status: 404 });
  }

  // "내 적립금 보기" 버튼(task.md) — 발급 실패해도(활성 처방 없음 등) 미션 화면 자체는
  // 정상 노출돼야 하므로 조용히 null 처리(버튼만 안 뜸, 페이지 에러 아님).
  const referralToken = await getOrIssueReferralTokenForPatient(submission.patientId).catch(() => null);

  // 템플릿 스냅샷 구조(task.md) — 오늘의 미션이 재지정되어도 이 토큰은 항상 자기 생성
  // 시점의 템플릿(퀴즈/사진/텍스트)으로만 렌더링된다.
  const template = submission.missionTemplate;
  return NextResponse.json({
    status: submission.status,
    quizAttempts: submission.quizAttempts,
    patientName: submission.patient.name,
    referralToken,
    mission: {
      type: template.type,
      category: template.category,
      title: template.title,
      body: template.body,
      quizOptions: parseQuizOptions(template.quizOptions),
      rewardAmount: template.rewardAmount,
    },
  });
}
