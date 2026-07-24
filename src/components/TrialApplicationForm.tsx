"use client";

import { useEffect, useState } from "react";
import styles from "./TrialApplicationForm.module.css";
import { BODY_TYPE_QUESTIONS, BODY_TYPE_OTHER_VALUE, BODY_TYPE_MAX_SELECTIONS } from "@/lib/trial-application-format";
import { parseCampaignDescription } from "@/lib/trial-campaign-description";
import { getShareBaseUrl } from "@/lib/share-base-url";
import KakaoShareButton from "@/components/KakaoShareButton";
import KakaoChannelButton from "@/components/KakaoChannelButton";

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

type TextFieldDef = { key: TextFieldKey; label: string; placeholder: string; multiline?: boolean };

// 키/체중 + 감량목표는 짧은 값이라 2열로 나란히 배치(task2.md 2항), 나머지는 기존처럼 세로 배치.
const HEIGHT_WEIGHT_FIELD: TextFieldDef = { key: "heightWeight", label: "키 / 체중", placeholder: "예: 160cm / 62kg" };
const WEIGHT_GOAL_FIELD: TextFieldDef = { key: "weightGoalKg", label: "감량 목표(kg)", placeholder: "예: 3kg" };
const REST_TEXT_FIELDS: TextFieldDef[] = [
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

  function renderTextField(field: TextFieldDef) {
    return (
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
    );
  }

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
    // 이 시점엔 아직 이 신청자 본인의 추천링크가 없다(추천링크는 나중에 직원이 처방을
    // 등록할 때 발급됨, referrals.ts issueTrialReferralLink) — 그래서 공유 대상은 개인화
    // 링크가 아니라 캠페인 신청페이지 자체(비개인화)로 한다.
    const baseUrl = getShareBaseUrl();
    const campaignLink = `${baseUrl}/refer/trial`;
    const campaignImageUrl = campaign?.heroImagePath ? `${baseUrl}${campaign.heroImagePath}` : undefined;

    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <p className={styles.completeText}>
            신청 완료되었습니다.
            <br />
            확인 후 직접 연락드릴게요!
          </p>

          <div className={styles.kakaoGuideBox}>
            <p className={styles.kakaoGuideTitle}>카카오톡 채팅창이 열립니다.</p>
            <p className={styles.kakaoGuideNote}>아래 중 아무거나 한 가지만 해주세요:</p>
            <ul className={styles.kakaoGuideList}>
              <li>&quot;관리자에게 문의하기&quot; 누르기</li>
              <li>메뉴에 뜨는 &quot;킬팻캡슐 3일 체험 신청&quot; 누르기</li>
              <li>채팅창에 직접 아무 메시지나 입력하기</li>
            </ul>
            <p className={styles.kakaoGuideNote}>
              이 중 하나만 하시면 저희가 신청 내용을 확인하고 연락드릴 수 있어요!
            </p>
          </div>

          <KakaoShareButton
            title={campaign?.headline || DEFAULT_HEADLINE}
            description={campaign?.description || DEFAULT_DESCRIPTION}
            link={campaignLink}
            imageUrl={campaignImageUrl}
          />

          <div className={styles.kakaoActionRow}>
            <button
              type="button"
              className={styles.kakaoChatButton}
              onClick={() => window.open(KAKAO_CHANNEL_CHAT_URL, "_blank", "noopener,noreferrer")}
            >
              카카오톡 채팅 문의
            </button>
            <KakaoChannelButton />
          </div>
        </div>
      </div>
    );
  }

  const parsedDescription = parseCampaignDescription(campaign?.description || DEFAULT_DESCRIPTION);

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

        <div className={styles.descriptionBlock}>
          {parsedDescription.intro.map((para, i) => (
            <p key={`intro-${i}`} className={styles.descIntro}>
              {para}
            </p>
          ))}
          {parsedDescription.body.map((para, i) => (
            <p key={`body-${i}`} className={styles.descBody}>
              {para}
            </p>
          ))}
          {parsedDescription.checklist.length > 0 && (
            <ul className={styles.descChecklist}>
              {parsedDescription.checklist.map((line, i) => (
                <li key={i} className={styles.descChecklistItem}>
                  <span className={styles.descCheckIcon} aria-hidden>
                    ✓
                  </span>
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          )}
          {parsedDescription.closing && <p className={styles.descClosing}>{parsedDescription.closing}</p>}
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.sectionCard}>
            <div className={styles.sectionTitle}>기본 정보</div>
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

            <div className={styles.fieldRow}>
              {renderTextField(HEIGHT_WEIGHT_FIELD)}
              {renderTextField(WEIGHT_GOAL_FIELD)}
            </div>

            {REST_TEXT_FIELDS.map(renderTextField)}
          </div>

          {BODY_TYPE_QUESTIONS.map((q, index) => {
            const selected = bodyTypeAnswers[q.key] ?? [];
            const otherSelected = selected.includes(BODY_TYPE_OTHER_VALUE);
            const progressPercent = ((index + 1) / BODY_TYPE_QUESTIONS.length) * 100;
            return (
              <div key={q.key} className={styles.bodyTypeBlock}>
                <div className={styles.bodyTypeProgressRow}>
                  <span className={styles.bodyTypeProgressLabel}>
                    {index + 1} / {BODY_TYPE_QUESTIONS.length}
                  </span>
                  <div className={styles.bodyTypeProgressTrack}>
                    <div className={styles.bodyTypeProgressFill} style={{ width: `${progressPercent}%` }} />
                  </div>
                </div>
                <span className={styles.fieldLabel}>
                  {index + 1}. {q.question} *
                </span>
                <span className={styles.maxSelectPill}>최대 2개 선택</span>

                <div className={styles.optionGrid}>
                  {q.options.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={
                        selected.includes(option.value)
                          ? `${styles.optionCard} ${styles.optionCardSelected}`
                          : styles.optionCard
                      }
                      onClick={() => toggleBodyTypeOption(q.key, option.value)}
                    >
                      <span className={styles.optionBadge}>{option.value}</span>
                      <span>{option.label}</span>
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  className={otherSelected ? `${styles.otherTrigger} ${styles.otherTriggerActive}` : styles.otherTrigger}
                  onClick={() => toggleBodyTypeOption(q.key, BODY_TYPE_OTHER_VALUE)}
                >
                  {otherSelected ? "✓ 기타 선택됨 (해제하려면 클릭)" : "+ 기타 직접 입력"}
                </button>
                {otherSelected && (
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
