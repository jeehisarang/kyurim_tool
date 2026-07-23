"use client";

import { useEffect, useState } from "react";
import styles from "./TrialApplicationForm.module.css";
import { BODY_TYPE_QUESTIONS, BODY_TYPE_OTHER_VALUE, BODY_TYPE_MAX_SELECTIONS } from "@/lib/trial-application-format";

// TeachingPageContent.tsx/s/[token]/page.tsx와 동일한 채널(task.md 보완 2항).
const KAKAO_CHANNEL_CHAT_URL =
  process.env.NEXT_PUBLIC_KAKAO_CHANNEL_CHAT_URL ?? "https://pf.kakao.com/_FVxlGT/chat";

type CampaignSettings = { heroImagePath: string | null; headline: string | null; description: string | null };

type TextFieldKey =
  | "heightWeight"
  | "weightGoalKg"
  | "weightChange6mo"
  | "currentMeds"
  | "pastHistory"
  | "familyHistory"
  | "dietExperience";

const TEXT_FIELDS: { key: TextFieldKey; label: string; placeholder: string; multiline?: boolean }[] = [
  { key: "heightWeight", label: "키 / 체중", placeholder: "예: 160cm / 62kg" },
  { key: "weightGoalKg", label: "감량 목표(kg)", placeholder: "예: 3kg" },
  { key: "weightChange6mo", label: "최근 6개월 체중 변화", placeholder: "예: 변화 없음 / 3kg 증가 등" },
  { key: "currentMeds", label: "현재 복용 중인 약물", placeholder: "없으면 비워두세요" },
  { key: "pastHistory", label: "과거 병력", placeholder: "없으면 비워두세요" },
  { key: "familyHistory", label: "가족력", placeholder: "없으면 비워두세요" },
  {
    key: "dietExperience",
    label: "다이어트 경험 (양방/한방 무관)",
    placeholder: "예: 원푸드 다이어트 시도, 한약 복용 경험 등",
    multiline: true,
  },
];

const DEFAULT_HEADLINE = "킬팻캡슐 3일체험, 지금 신청하세요";
const DEFAULT_DESCRIPTION = "간단한 정보만 남겨주시면 확인 후 직접 연락드릴게요!";

export default function TrialApplicationForm({ referralToken }: { referralToken?: string }) {
  const [campaign, setCampaign] = useState<CampaignSettings | null>(null);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [textValues, setTextValues] = useState<Record<TextFieldKey, string>>({
    heightWeight: "",
    weightGoalKg: "",
    weightChange6mo: "",
    currentMeds: "",
    pastHistory: "",
    familyHistory: "",
    dietExperience: "",
  });
  // 문항당 최대 2개 선택(task.md 보완 1항 — 원본 구글폼 규칙).
  const [bodyTypeAnswers, setBodyTypeAnswers] = useState<Record<string, string[]>>({});
  const [bodyTypeOthers, setBodyTypeOthers] = useState<Record<string, string>>({});

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    fetch("/api/trial-campaign")
      .then((res) => res.json())
      .then(setCampaign)
      .catch(() => setCampaign({ heroImagePath: null, headline: null, description: null }));
  }, []);

  function toggleBodyTypeOption(key: string, value: string) {
    setBodyTypeAnswers((prev) => {
      const current = prev[key] ?? [];
      if (current.includes(value)) {
        return { ...prev, [key]: current.filter((v) => v !== value) };
      }
      if (current.length >= BODY_TYPE_MAX_SELECTIONS) {
        alert(`이 문항은 최대 ${BODY_TYPE_MAX_SELECTIONS}개까지 선택할 수 있습니다.`);
        return prev;
      }
      return { ...prev, [key]: [...current, value] };
    });
  }

  const allBodyTypesAnswered = BODY_TYPE_QUESTIONS.every((q) => {
    const answers = bodyTypeAnswers[q.key] ?? [];
    if (answers.length === 0) return false;
    if (answers.includes(BODY_TYPE_OTHER_VALUE)) return Boolean(bodyTypeOthers[q.key]?.trim());
    return true;
  });
  const canSubmit = name.trim() && phone.trim() && allBodyTypesAnswered && !submitting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    // 팝업 차단 회피를 위해 클릭 핸들러 내에서 동기적으로 먼저 연다(s/[token]/page.tsx
    // handleEventCtaClick과 동일한 원칙, task.md 보완 2항) — 제출 성공 여부와 무관하게 열림.
    window.open(KAKAO_CHANNEL_CHAT_URL, "_blank", "noopener,noreferrer");
    setSubmitting(true);
    setSubmitError(null);
    try {
      const body: Record<string, unknown> = {
        name: name.trim(),
        phone: phone.trim(),
        ...textValues,
      };
      for (const q of BODY_TYPE_QUESTIONS) {
        body[q.key] = bodyTypeAnswers[q.key] ?? [];
        if ((bodyTypeAnswers[q.key] ?? []).includes(BODY_TYPE_OTHER_VALUE)) {
          body[`${q.key}Other`] = bodyTypeOthers[q.key] ?? "";
        }
      }
      if (referralToken) body.referralToken = referralToken;

      const res = await fetch("/api/trial-applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setSubmitError(data.error ?? "신청에 실패했습니다. 다시 시도해주세요.");
        return;
      }
      setSubmitted(true);
    } catch {
      setSubmitError("서버에 연결하지 못했습니다. 다시 시도해주세요.");
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <p className={styles.completeText}>
            신청 완료되었습니다.
            <br />
            확인 후 직접 연락드릴게요!
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        {referralToken && (
          <div className={styles.referralBadge}>
            <span className={styles.referralBadgeMain}>🎁 친구의 추천으로 오셨네요!</span>
            <span className={styles.referralBadgeCode}>추천코드: {referralToken}</span>
          </div>
        )}

        {campaign?.heroImagePath && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={campaign.heroImagePath} alt="" className={styles.heroImage} />
        )}
        <h1 className={styles.headline}>{campaign?.headline || DEFAULT_HEADLINE}</h1>
        <p className={styles.description}>{campaign?.description || DEFAULT_DESCRIPTION}</p>

        <form onSubmit={handleSubmit} className={styles.form}>
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

          {TEXT_FIELDS.map((field) => (
            <label key={field.key} className={styles.field}>
              <span className={styles.fieldLabel}>{field.label}</span>
              {field.multiline ? (
                <textarea
                  className={styles.textareaInput}
                  rows={3}
                  value={textValues[field.key]}
                  onChange={(e) => setTextValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
                  placeholder={field.placeholder}
                />
              ) : (
                <input
                  className={styles.textInput}
                  type="text"
                  value={textValues[field.key]}
                  onChange={(e) => setTextValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
                  placeholder={field.placeholder}
                />
              )}
            </label>
          ))}

          {BODY_TYPE_QUESTIONS.map((q, index) => {
            const selected = bodyTypeAnswers[q.key] ?? [];
            return (
              <div key={q.key} className={styles.bodyTypeBlock}>
                <span className={styles.fieldLabel}>
                  {index + 1}. {q.question} * <span className={styles.bodyTypeHint}>(최대 2개)</span>
                </span>
                <div className={styles.optionGrid}>
                  {q.options.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={
                        selected.includes(option.value)
                          ? `${styles.optionButton} ${styles.optionButtonSelected}`
                          : styles.optionButton
                      }
                      onClick={() => toggleBodyTypeOption(q.key, option.value)}
                    >
                      {option.value}. {option.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    className={
                      selected.includes(BODY_TYPE_OTHER_VALUE)
                        ? `${styles.optionButton} ${styles.optionButtonSelected}`
                        : styles.optionButton
                    }
                    onClick={() => toggleBodyTypeOption(q.key, BODY_TYPE_OTHER_VALUE)}
                  >
                    기타
                  </button>
                </div>
                {selected.includes(BODY_TYPE_OTHER_VALUE) && (
                  <input
                    className={styles.textInput}
                    type="text"
                    value={bodyTypeOthers[q.key] ?? ""}
                    onChange={(e) => setBodyTypeOthers((prev) => ({ ...prev, [q.key]: e.target.value }))}
                    placeholder="직접 입력해주세요"
                  />
                )}
              </div>
            );
          })}

          {submitError && <p className={styles.errorText}>{submitError}</p>}

          <button type="submit" className={styles.submitButton} disabled={!canSubmit}>
            {submitting ? "신청 중..." : "신청하기"}
          </button>
        </form>
      </div>
    </div>
  );
}
