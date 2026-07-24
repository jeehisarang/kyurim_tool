"use client";

import { useEffect, useState } from "react";
import styles from "./MyReferralPage.module.css";
import { copyToClipboard } from "@/lib/clipboard";
import KakaoShareButton from "@/components/KakaoShareButton";
import { getShareBaseUrl } from "@/lib/share-base-url";

type ReferralStatus = {
  token: string;
  kind: "TRIAL" | "MAIN";
  expiresAt: string;
  isActive: boolean;
  maxCount: number;
  maxAmount: number;
  confirmedCount: number;
  confirmedAmount: number;
};

function formatDate(iso: string): string {
  return iso.slice(0, 10);
}

/**
 * "내 추천 현황" 전용 공개페이지(task.md) — 기존 신청폼(/refer/trial/[token])/마감설문
 * 상단에 같이 떠 있던 배너(코드/적립현황/복사/카톡공유)를 그대로 이전했다. 코드 소유자
 * 본인만 보는 화면이라 여기서 카톡공유하는 링크는 항상 실제 신청폼 주소다.
 */
export default function MyReferralPage({ token }: { token: string }) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [status, setStatus] = useState<ReferralStatus | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch(`/api/referral-links/${token}`)
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? "추천 현황을 불러오지 못했습니다.");
        }
        return res.json();
      })
      .then(setStatus)
      .catch((err) => setLoadError(err instanceof Error ? err.message : "추천 현황을 불러오지 못했습니다."))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <p className={styles.completeText}>불러오는 중...</p>
        </div>
      </div>
    );
  }

  if (loadError || !status) {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <p className={styles.errorText}>{loadError ?? "추천 현황을 찾을 수 없습니다."}</p>
        </div>
      </div>
    );
  }

  // 공유/복사 대상은 항상 신청폼(/refer/trial/[token]) 주소다 — 이 추천링크가 TRIAL/MAIN
  // 어느 kind든, 신청폼 제출 시 referralToken 검증은 kind를 가리지 않고 이 token 하나로
  // 동작한다(referrals.ts createTrialApplication). 친구가 이 링크로 신청하면 항상
  // TRIAL_SIGNUP 적립이 발생한다(MAIN 적립은 별도로 직원이 처방등록 화면에서 수동 확정).
  const applyUrl = `${getShareBaseUrl()}/refer/trial/${status.token}`;

  async function handleCopy() {
    const success = await copyToClipboard(applyUrl);
    if (!success) {
      alert("복사에 실패했습니다. 링크를 직접 선택해서 복사해주세요.");
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.headline}>내 추천 현황</h1>

        <div className={styles.referralBanner}>
          {status.maxCount > 0 ? (
            <>
              <div className={styles.referralStatsRow}>
                <div className={styles.referralStatCard}>
                  <span className={styles.referralStatLabel}>신청 인원</span>
                  <span className={styles.referralStatValue}>{status.maxCount}명</span>
                </div>
                <div className={styles.referralStatCard}>
                  <span className={styles.referralStatLabel}>최대 적립금</span>
                  <span className={styles.referralStatValue}>{status.maxAmount.toLocaleString()}원</span>
                </div>
              </div>
              {status.kind === "TRIAL" && (
                <p className={styles.referralFootnote}>
                  * 실제 체험 진행 시 확정되며, 확정 적립금만 본프로그램 신청 시 사용 가능해요.
                </p>
              )}
              <div className={styles.referralStatsRow}>
                <div className={styles.referralStatCard}>
                  <span className={styles.referralStatLabel}>확정 인원</span>
                  <span className={styles.referralStatValue}>{status.confirmedCount}명</span>
                </div>
                <div className={styles.referralStatCard}>
                  <span className={styles.referralStatLabel}>확정 적립금</span>
                  <span className={styles.referralStatValue}>{status.confirmedAmount.toLocaleString()}원</span>
                </div>
              </div>
            </>
          ) : (
            <p className={styles.referralWarning}>
              아직 추천으로 오신 분이 없어요. {formatDate(status.expiresAt)}까지 이 링크로 친구가 신청하면
              적립금이 쌓여요.
            </p>
          )}
          <p className={styles.referralSafeNotice}>
            이 코드는 회원님만의 고유 코드이며, 개인정보가 없어 SNS·단톡방에 자유롭게 공유해도 안전합니다.
          </p>
        </div>

        <div className={styles.referralActionsRow}>
          <button type="button" className={styles.copyButton} onClick={handleCopy}>
            {copied ? "복사됨!" : "내 추천링크 복사하기"}
          </button>
          <KakaoShareButton
            title="규림한의원 킬팻캡슐 3일체험"
            description="저도 해본 킬팻캡슐 3일체험, 부담없이 한번 받아보세요! 규림한의원에서 무료로 체험하실 수 있어요."
            link={applyUrl}
          />
        </div>
      </div>
    </div>
  );
}
