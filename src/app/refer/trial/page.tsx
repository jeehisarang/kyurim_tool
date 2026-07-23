import TrialApplicationForm from "@/components/TrialApplicationForm";

// 원내 QR용(추천코드 없음) — /refer/trial/[token]과 동일 컴포넌트를 token 없이 재사용.
export default function TrialReferralPage() {
  return <TrialApplicationForm />;
}
