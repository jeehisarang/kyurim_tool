"use client";

import { useParams } from "next/navigation";
import TrialApplicationForm from "@/components/TrialApplicationForm";

// 추천링크로 진입 — 배지 문구는 서버 조회 없이 URL의 token을 그대로 노출한다("링크
// 소유자 이름은 노출하지 않음, 코드만"이라는 요구사항상 조회할 개인정보가 없다).
export default function TrialReferralWithTokenPage() {
  const params = useParams<{ token: string }>();
  return <TrialApplicationForm referralToken={params.token} />;
}
