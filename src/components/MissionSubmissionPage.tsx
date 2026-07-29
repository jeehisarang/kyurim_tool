"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import styles from "./MissionSubmissionPage.module.css";

// 이미지 원본 비율(1536x1024, 3:2) — next/image가 width/height 없이는 최적화를 못 하므로
// 실제 파일 크기를 그대로 전달하고, CSS(width:100%; height:auto)로 화면폭에 맞춰
// 비율을 유지한 채 늘어나게 한다.
const BANNER_WIDTH = 1536;
const BANNER_HEIGHT = 1024;

// 미션톡 고정 타이틀(task3.md) — missions.ts MISSION_FIXED_TITLE과 항상 같은 문자열을
// 유지해야 한다(카톡 발송 문구와 페이지가 이어지는 느낌을 주기 위함).
const MISSION_FIXED_TITLE = "🎯 이번 주 규림미션";

function MissionFixedTitle() {
  return (
    <div className={styles.fixedTitleWrap}>
      <span className={styles.fixedTitle}>{MISSION_FIXED_TITLE}</span>
    </div>
  );
}

/**
 * 미션 페이지 공통 배너(task.md) — 퀴즈/사진/텍스트 전부, 그리고 로딩/에러 화면까지
 * 항상 최상단에 노출한다. 순수 장식/브랜딩 목적이라 클릭 이벤트가 없다. 이미지 로딩에
 * 실패해도(onError) 배너 영역만 조용히 숨기고 아래 미션 콘텐츠는 그대로 정상 노출되게
 * 한다 — 페이지 전체가 깨지면 안 된다는 요구사항.
 */
function MissionBanner() {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <div className={styles.bannerWrap}>
      <Image
        src="/images/mission-banner.png"
        alt="규림한의원 미션톡"
        width={BANNER_WIDTH}
        height={BANNER_HEIGHT}
        className={styles.banner}
        priority
        onError={() => setFailed(true)}
      />
    </div>
  );
}

type MissionInfo = {
  type: string;
  category: string;
  title: string;
  body: string;
  quizOptions: string[];
  rewardAmount: number;
};

type MissionData = {
  status: string;
  quizAttempts: number;
  patientName: string;
  referralToken: string | null;
  mission: MissionInfo;
};

const DONE_STATUSES = ["AUTO_COMPLETED", "APPROVED"];

/**
 * 미션 제출 공개 페이지(/m/[token], task.md 3-4) — 인증 없음. QUIZ는 4지선다+재시도,
 * PHOTO/TEXT는 제출 후 "직원 확인 후 적립돼요" 안내.
 */
export default function MissionSubmissionPage({ token }: { token: string }) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [data, setData] = useState<MissionData | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [wrongAnswer, setWrongAnswer] = useState(false);
  const [textValue, setTextValue] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  function load() {
    fetch(`/api/missions/${token}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? "미션을 찾을 수 없습니다.");
        }
        return res.json();
      })
      .then(setData)
      .catch((err) => setLoadError(err instanceof Error ? err.message : "미션을 찾을 수 없습니다."))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function handleQuizSelect(index: number) {
    setSubmitting(true);
    setSubmitError(null);
    setWrongAnswer(false);
    try {
      const formData = new FormData();
      formData.set("selectedIndex", String(index));
      const res = await fetch(`/api/missions/${token}/submit`, { method: "POST", body: formData });
      const result = await res.json();
      if (!res.ok) {
        setSubmitError(result.error ?? "제출에 실패했습니다.");
        return;
      }
      if (result.correct) {
        load();
      } else {
        setWrongAnswer(true);
        setData((prev) => (prev ? { ...prev, quizAttempts: result.quizAttempts } : prev));
      }
    } catch {
      setSubmitError("서버에 연결하지 못했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleTextSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!textValue.trim()) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const formData = new FormData();
      formData.set("text", textValue.trim());
      const res = await fetch(`/api/missions/${token}/submit`, { method: "POST", body: formData });
      if (!res.ok) {
        const result = await res.json().catch(() => ({}));
        setSubmitError(result.error ?? "제출에 실패했습니다.");
        return;
      }
      load();
    } catch {
      setSubmitError("서버에 연결하지 못했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePhotoSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!photoFile) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const formData = new FormData();
      formData.set("photo", photoFile);
      const res = await fetch(`/api/missions/${token}/submit`, { method: "POST", body: formData });
      if (!res.ok) {
        const result = await res.json().catch(() => ({}));
        setSubmitError(result.error ?? "제출에 실패했습니다.");
        return;
      }
      load();
    } catch {
      setSubmitError("서버에 연결하지 못했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <>
        <MissionBanner />
        <MissionFixedTitle />
        <div className={styles.page}>
          <div className={styles.card}>
            <p className={styles.completeText}>불러오는 중...</p>
          </div>
        </div>
      </>
    );
  }

  if (loadError || !data) {
    return (
      <>
        <MissionBanner />
        <MissionFixedTitle />
        <div className={styles.page}>
          <div className={styles.card}>
            <p className={styles.errorText}>{loadError ?? "미션을 찾을 수 없습니다."}</p>
          </div>
        </div>
      </>
    );
  }

  const { mission, status } = data;

  return (
    <>
      <MissionBanner />
      <MissionFixedTitle />
      <div className={styles.page}>
        <div className={styles.card}>
          <h1 className={styles.headline}>{mission.title}</h1>

        {DONE_STATUSES.includes(status) && (
          <div className={styles.completeText}>
            🎉 적립 완료!
            <div className={styles.rewardBadge}>{mission.rewardAmount.toLocaleString()}원 적립</div>
          </div>
        )}

        {status === "PENDING_APPROVAL" && (
          <p className={styles.completeText}>제출 완료! 직원 확인 후 적립돼요.</p>
        )}

        {/* 승인 전이라도 지금까지 쌓인 잔액은 볼 수 있어야 함(task.md) */}
        {(DONE_STATUSES.includes(status) || status === "PENDING_APPROVAL") && data.referralToken && (
          <a href={`/refer/my/${data.referralToken}`} className={styles.submitButton} style={{ display: "block", textAlign: "center", textDecoration: "none", marginTop: 12 }}>
            내 적립금 보기
          </a>
        )}

        {status === "REJECTED" && <p className={styles.errorText}>이번 제출은 반려되었습니다.</p>}

        {status === "SENT" && mission.type === "QUIZ" && (
          <>
            <p className={styles.bodyText}>{mission.body}</p>
            {wrongAnswer && <p className={styles.retryText}>아쉬워요, 다시 시도해보세요!</p>}
            {mission.quizOptions.map((option, index) => (
              <button
                key={index}
                type="button"
                className={styles.optionButton}
                disabled={submitting}
                onClick={() => handleQuizSelect(index)}
              >
                {option}
              </button>
            ))}
            {submitError && <p className={styles.errorText}>{submitError}</p>}
          </>
        )}

        {status === "SENT" && mission.type === "PHOTO" && (
          <form onSubmit={handlePhotoSubmit}>
            <p className={styles.bodyText}>{mission.body}</p>
            <input
              className={styles.fileInput}
              type="file"
              accept="image/*"
              onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)}
            />
            {submitError && <p className={styles.errorText}>{submitError}</p>}
            <button type="submit" className={styles.submitButton} disabled={!photoFile || submitting}>
              {submitting ? "제출 중..." : "제출하기"}
            </button>
          </form>
        )}

        {status === "SENT" && mission.type === "TEXT" && (
          <form onSubmit={handleTextSubmit}>
            <p className={styles.bodyText}>{mission.body}</p>
            <textarea
              className={styles.textarea}
              rows={5}
              value={textValue}
              onChange={(e) => setTextValue(e.target.value)}
            />
            {submitError && <p className={styles.errorText}>{submitError}</p>}
            <button type="submit" className={styles.submitButton} disabled={!textValue.trim() || submitting}>
              {submitting ? "제출 중..." : "제출하기"}
            </button>
          </form>
        )}
        </div>
      </div>
    </>
  );
}
