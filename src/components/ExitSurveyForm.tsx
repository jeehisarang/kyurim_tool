"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import styles from "./ExitSurveyForm.module.css";
import { MAIN_REFERRAL_DISCOUNT_AMOUNT } from "@/lib/referral-config";
import {
  CHANGE_OPTIONS,
  CHANGE_OTHER_VALUE,
  COMPLIANCE_OPTIONS,
  CONSULT_INTEREST_OPTIONS,
  type ComplianceValue,
  type ConsultInterestValue,
} from "@/lib/exit-survey-format";

type ReferralStatus = {
  token: string;
  expiresAt: string;
  maxCount: number;
  maxAmount: number;
  confirmedCount: number;
  confirmedAmount: number;
};

type PageData = {
  patientName: string;
  alreadySubmitted: boolean;
  referralStatus: ReferralStatus | null;
};

// "내 추천 현황 보기" 링크(task.md) — 코드/적립현황/복사/카톡공유 전체는 전용 공개페이지
// (/refer/my/[token])로 옮겼다. 여기(마감설문)는 진입 지점만 남겨둔다.
function ReferralLinkOut({ token }: { token: string }) {
  return (
    <Link href={`/refer/my/${token}`} className={styles.referralLinkOut}>
      내 추천 현황 보기 →
    </Link>
  );
}

export default function ExitSurveyForm({ prescriptionId }: { prescriptionId: number }) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pageData, setPageData] = useState<PageData | null>(null);

  const [compliance, setCompliance] = useState<ComplianceValue | "">("");
  const [selectedChanges, setSelectedChanges] = useState<string[]>([]);
  const [otherChecked, setOtherChecked] = useState(false);
  const [otherText, setOtherText] = useState("");
  const [consultInterest, setConsultInterest] = useState<ConsultInterestValue | "">("");
  const [comment, setComment] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    fetch(`/api/exit-survey/${prescriptionId}`)
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? "설문 정보를 불러오지 못했습니다.");
        }
        return res.json();
      })
      .then(setPageData)
      .catch((err) => setLoadError(err instanceof Error ? err.message : "설문 정보를 불러오지 못했습니다."))
      .finally(() => setLoading(false));
  }, [prescriptionId]);

  function toggleChange(value: string) {
    setSelectedChanges((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]));
  }

  const hasAnyChange = selectedChanges.length > 0 || (otherChecked && otherText.trim().length > 0);
  const canSubmit = Boolean(compliance) && hasAnyChange && Boolean(consultInterest) && !submitting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const changes = [...selectedChanges, ...(otherChecked && otherText.trim() ? [otherText.trim()] : [])];
      const res = await fetch(`/api/exit-survey/${prescriptionId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ compliance, changes, consultInterest, comment: comment.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setSubmitError(data.error ?? "제출에 실패했습니다. 다시 시도해주세요.");
        return;
      }
      setSubmitted(true);
    } catch {
      setSubmitError("서버에 연결하지 못했습니다. 다시 시도해주세요.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <p className={styles.completeText}>불러오는 중...</p>
        </div>
      </div>
    );
  }

  if (loadError || !pageData) {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <p className={styles.errorText}>{loadError ?? "설문 정보를 불러오지 못했습니다."}</p>
        </div>
      </div>
    );
  }

  const showComplete = submitted || pageData.alreadySubmitted;

  if (showComplete) {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <p className={styles.completeText}>마감설문 제출이 완료되었습니다. 수고 많으셨어요!</p>
          <p className={styles.referralExtraNotice}>
            {MAIN_REFERRAL_DISCOUNT_AMOUNT.toLocaleString()}원 할인이 본프로그램 신청 시 적용됩니다.
          </p>
          {pageData.referralStatus && <ReferralLinkOut token={pageData.referralStatus.token} />}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.headline}>3일체험 마감설문</h1>

        {pageData.referralStatus && <ReferralLinkOut token={pageData.referralStatus.token} />}

        <form onSubmit={handleSubmit} className={styles.form}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>이름</span>
            <input className={styles.textInput} type="text" value={pageData.patientName} readOnly />
          </label>

          <div className={styles.field}>
            <span className={styles.fieldLabel}>복용은 잘 하셨나요? *</span>
            <div className={styles.optionGrid}>
              {COMPLIANCE_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  className={
                    compliance === option ? `${styles.optionButton} ${styles.optionButtonSelected}` : styles.optionButton
                  }
                  onClick={() => setCompliance(option)}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.field}>
            <span className={styles.fieldLabel}>
              복용 후 느껴지는 변화는? <span className={styles.fieldHint}>(중복선택)</span>
            </span>
            <div className={styles.optionGrid}>
              {CHANGE_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  className={
                    selectedChanges.includes(option)
                      ? `${styles.optionButton} ${styles.optionButtonSelected}`
                      : styles.optionButton
                  }
                  onClick={() => toggleChange(option)}
                >
                  {option}
                </button>
              ))}
              <button
                type="button"
                className={otherChecked ? `${styles.optionButton} ${styles.optionButtonSelected}` : styles.optionButton}
                onClick={() => setOtherChecked((prev) => !prev)}
              >
                {CHANGE_OTHER_VALUE}
              </button>
            </div>
            {otherChecked && (
              <input
                className={styles.textInput}
                type="text"
                value={otherText}
                onChange={(e) => setOtherText(e.target.value)}
                placeholder="직접 입력해주세요"
              />
            )}
          </div>

          <div className={styles.field}>
            <span className={styles.fieldLabel}>본상담을 받아보고 싶으신가요? *</span>
            <div className={styles.optionGrid}>
              {CONSULT_INTEREST_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  className={
                    consultInterest === option
                      ? `${styles.optionButton} ${styles.optionButtonSelected}`
                      : styles.optionButton
                  }
                  onClick={() => setConsultInterest(option)}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>

          <label className={styles.field}>
            <span className={styles.fieldLabel}>한줄소감</span>
            <textarea
              className={styles.textareaInput}
              rows={3}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="자유롭게 남겨주세요 (선택)"
            />
          </label>

          {submitError && <p className={styles.errorText}>{submitError}</p>}

          <button type="submit" className={styles.submitButton} disabled={!canSubmit}>
            {submitting ? "제출 중..." : "제출하기"}
          </button>
        </form>
      </div>
    </div>
  );
}
