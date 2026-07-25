"use client";

import { useState } from "react";
import styles from "./MainTierLandingChoice.module.css";
import TrialApplicationForm from "@/components/TrialApplicationForm";

type Mode = "choice" | "trial" | "directForm" | "directDone";

type RefereeDiscounts = { oneMonth: number; threeMonth: number };

// 추천코드 노출 통일(task.md) — 기존 TRIAL 체험유도 화면(TrialApplicationForm)의
// referralBadge와 동일한 문구/스타일. 코드는 비식별 토큰이라 노출해도 개인정보 문제
// 없다는 원칙이 확정돼(task.md), 이 분기 화면과 그 하위(선택 전/바로등록 폼/완료) 전부에
// 동일하게 노출한다 — "3일 체험" 선택 후에는 TrialApplicationForm 자체가 이미 동일 배지를
// 보여주므로 별도 처리 불필요.
function ReferralCodeBadge({ token }: { token: string }) {
  return (
    <div className={styles.referralBadge}>
      <span className={styles.referralBadgeMain}>🎁 친구의 추천으로 오셨네요!</span>
      <span className={styles.referralBadgeCode}>추천코드: {token}</span>
    </div>
  );
}

/**
 * MAIN 등급 추천링크 랜딩페이지 분기 화면(task.md 추천 이벤트 개선 3) — /refer/trial/[token]이
 * tier="MAIN"인 링크로 진입했을 때 대신 렌더링된다. "3일 무료체험 먼저 해보기"를 고르면
 * 기존 TrialApplicationForm을 그대로 재사용하고(체험 신청 이벤트와 동일 로직), "바로 등록하고
 * 할인받기"를 고르면 이름/연락처만 받는 간단한 상담 신청 폼을 보여준다 — 실제 Prescription
 * 등록/추천인 연결은 이 폼이 아니라 직원이 /prescriptions/new "소개 확인"에서 수동으로
 * 처리한다(requestMainDirectRegistrationCallback이 만드는 업무에 추천인 이름이 적혀 있어
 * 직원이 바로 찾아 연결할 수 있다).
 */
export default function MainTierLandingChoice({
  token,
  refereeDiscounts,
}: {
  token: string;
  refereeDiscounts: RefereeDiscounts;
}) {
  const [mode, setMode] = useState<Mode>("choice");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  if (mode === "trial") {
    return <TrialApplicationForm referralToken={token} />;
  }

  async function handleDirectSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !phone.trim() || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch(`/api/referral-links/${token}/main-direct-registration`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), phone: phone.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setSubmitError(data.error ?? "신청에 실패했습니다. 다시 시도해주세요.");
        return;
      }
      setMode("directDone");
    } catch {
      setSubmitError("서버에 연결하지 못했습니다. 다시 시도해주세요.");
    } finally {
      setSubmitting(false);
    }
  }

  if (mode === "directDone") {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <ReferralCodeBadge token={token} />
          <p className={styles.completeText}>
            신청 완료되었습니다.
            <br />
            확인 후 직접 연락드릴게요!
          </p>
        </div>
      </div>
    );
  }

  if (mode === "directForm") {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <ReferralCodeBadge token={token} />
          <h1 className={styles.headline}>바로 등록하고 할인받기</h1>
          <p className={styles.discountNotice}>
            친구 소개 혜택으로 1개월 등록 시 {refereeDiscounts.oneMonth.toLocaleString()}원, 3개월 등록 시{" "}
            {refereeDiscounts.threeMonth.toLocaleString()}원 할인이 적용됩니다.
          </p>
          <form onSubmit={handleDirectSubmit} className={styles.form}>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>이름 *</span>
              <input
                className={styles.textInput}
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="이름을 입력해주세요"
              />
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>연락처 *</span>
              <input
                className={styles.textInput}
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="010-0000-0000"
              />
            </label>
            {submitError && <p className={styles.errorText}>{submitError}</p>}
            <button
              type="submit"
              className={styles.submitButton}
              disabled={submitting || !name.trim() || !phone.trim()}
            >
              {submitting ? "신청 중..." : "상담 신청하기"}
            </button>
            <button type="button" className={styles.backButton} onClick={() => setMode("choice")}>
              ← 뒤로
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <ReferralCodeBadge token={token} />
        <h1 className={styles.headline}>어떻게 시작해볼까요?</h1>
        <p className={styles.subText}>둘 중 편하신 방법을 골라주세요.</p>

        <div className={styles.choiceGrid}>
          <button type="button" className={styles.choiceCard} onClick={() => setMode("trial")}>
            <span className={styles.choiceTitle}>3일 무료체험 먼저 해보기</span>
            <span className={styles.choiceDesc}>부담없이 킬팻캡슐을 먼저 체험해보세요.</span>
          </button>
          <button type="button" className={styles.choiceCard} onClick={() => setMode("directForm")}>
            <span className={styles.choiceTitle}>바로 등록하고 할인받기</span>
            <span className={styles.choiceDesc}>
              1개월 {refereeDiscounts.oneMonth.toLocaleString()}원 / 3개월{" "}
              {refereeDiscounts.threeMonth.toLocaleString()}원 할인
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
