"use client";

import { useParams } from "next/navigation";
import MyReferralPage from "@/components/MyReferralPage";

// "내 추천 현황" 전용 공개페이지(task.md) — 신청폼(/refer/trial/[token])에서 배너를
// 떼어내 여기로 옮겼다. 신청폼은 "친구가 받는 화면", 이 페이지는 "코드 소유자 본인이
// 보는 화면"으로 역할을 완전히 분리한다.
export default function ReferMyPage() {
  const params = useParams<{ token: string }>();
  return <MyReferralPage token={params.token} />;
}
