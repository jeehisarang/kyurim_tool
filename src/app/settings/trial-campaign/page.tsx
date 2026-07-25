"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import styles from "./page.module.css";
import BackButton from "@/components/BackButton";
import QrCodeImage from "@/components/QrCodeImage";
import { useCurrentUserContext } from "@/lib/CurrentUserContext";
import { getShareBaseUrl } from "@/lib/share-base-url";

type CampaignSettings = {
  heroImagePath: string | null;
  headline: string | null;
  description: string | null;
  mainReferrerAmount1mo: number | null;
  mainRefereeAmount1mo: number | null;
  mainReferrerAmount3mo: number | null;
  mainRefereeAmount3mo: number | null;
};

const MAIN_REFERRAL_AMOUNT_DEFAULTS = {
  mainReferrerAmount1mo: 35000,
  mainRefereeAmount1mo: 15000,
  mainReferrerAmount3mo: 70000,
  mainRefereeAmount3mo: 30000,
};

/**
 * 킬팻캡슐 3일체험 추천 이벤트(task.md 1-5) 원장 전용 설정화면 — 공개 신청페이지
 * (/refer/trial)의 히어로 이미지/헤드라인/설명을 편집한다. settings/programs와 동일하게
 * 클라이언트 체크는 UX 안내용, 서버단 재검증은 POST /api/trial-campaign이 isDirector로 처리.
 */
export default function TrialCampaignSettingsPage() {
  const { currentUser } = useCurrentUserContext();
  const isDirector = currentUser?.role === "원장";

  const [settings, setSettings] = useState<CampaignSettings | null>(null);
  const [headline, setHeadline] = useState("");
  const [description, setDescription] = useState("");
  const [heroFile, setHeroFile] = useState<File | null>(null);
  const [heroPreview, setHeroPreview] = useState<string | null>(null);
  // 본프로그램 추천 적립금(task.md 추천 이벤트 개선 1-2) — 비워두면(빈 문자열) 기본값을
  // 그대로 쓴다는 뜻이라 숫자 0과 구분해서 문자열로 들고 있는다.
  const [mainReferrerAmount1mo, setMainReferrerAmount1mo] = useState("");
  const [mainRefereeAmount1mo, setMainRefereeAmount1mo] = useState("");
  const [mainReferrerAmount3mo, setMainReferrerAmount3mo] = useState("");
  const [mainRefereeAmount3mo, setMainRefereeAmount3mo] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/trial-campaign")
      .then((res) => res.json())
      .then((data: CampaignSettings) => {
        setSettings(data);
        setHeadline(data.headline ?? "");
        setDescription(data.description ?? "");
        setMainReferrerAmount1mo(data.mainReferrerAmount1mo != null ? String(data.mainReferrerAmount1mo) : "");
        setMainRefereeAmount1mo(data.mainRefereeAmount1mo != null ? String(data.mainRefereeAmount1mo) : "");
        setMainReferrerAmount3mo(data.mainReferrerAmount3mo != null ? String(data.mainReferrerAmount3mo) : "");
        setMainRefereeAmount3mo(data.mainRefereeAmount3mo != null ? String(data.mainRefereeAmount3mo) : "");
      });
  }, []);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setHeroFile(file);
    setHeroPreview(file ? URL.createObjectURL(file) : null);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!currentUser) return;
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      const formData = new FormData();
      formData.set("staffUserId", String(currentUser.id));
      formData.set("headline", headline);
      formData.set("description", description);
      formData.set("mainReferrerAmount1mo", mainReferrerAmount1mo);
      formData.set("mainRefereeAmount1mo", mainRefereeAmount1mo);
      formData.set("mainReferrerAmount3mo", mainReferrerAmount3mo);
      formData.set("mainRefereeAmount3mo", mainRefereeAmount3mo);
      if (heroFile) formData.set("heroImage", heroFile);

      const res = await fetch("/api/trial-campaign", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        setSaveError(data.error ?? "저장에 실패했습니다.");
        return;
      }
      setSettings(data);
      setHeroFile(null);
      setHeroPreview(null);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch {
      setSaveError("서버에 연결하지 못했습니다. 다시 시도해주세요.");
    } finally {
      setSaving(false);
    }
  }

  const previewImage = heroPreview ?? settings?.heroImagePath ?? null;

  return (
    <div className={styles.container}>
      <div className={styles.titleRow}>
        <BackButton />
        <h1 className={styles.pageTitle}>체험이벤트 관리</h1>
      </div>
      <p className={styles.muted}>
        공개 신청페이지(/refer/trial)에 노출되는 히어로 이미지/헤드라인/설명 문구를
        관리합니다.
      </p>

      <div className={styles.section}>
        {!isDirector && <p className={styles.errorText}>원장만 저장할 수 있습니다.</p>}
        {settings === null ? (
          <p className={styles.muted}>불러오는 중...</p>
        ) : (
          <form className={styles.formGrid} onSubmit={handleSave}>
            <label className={styles.fieldLabel}>
              히어로 이미지
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {previewImage && <img src={previewImage} alt="" className={styles.preview} />}
              <input type="file" accept="image/*" onChange={handleFileChange} disabled={!isDirector} />
            </label>
            <label className={styles.fieldLabel}>
              헤드라인
              <input
                type="text"
                placeholder="예: 킬팻캡슐 3일체험, 지금 신청하세요"
                value={headline}
                onChange={(e) => setHeadline(e.target.value)}
                disabled={!isDirector}
              />
            </label>
            <label className={styles.fieldLabel}>
              설명 문구
              <textarea
                rows={3}
                placeholder="예: 간단한 정보만 남겨주시면 확인 후 직접 연락드릴게요!"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={!isDirector}
              />
            </label>
            <button type="submit" disabled={!isDirector || saving}>
              {saving ? "저장 중..." : saved ? "저장됨" : "저장"}
            </button>
            {saveError && <p className={styles.errorText}>{saveError}</p>}
          </form>
        )}
      </div>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>본프로그램 추천 적립금</div>
        <p className={styles.muted}>
          비워두면 기본값(1개월: 소개자 35,000원 / 피소개자 15,000원, 3개월: 소개자 70,000원 /
          피소개자 30,000원)이 적용됩니다.
        </p>
        {settings === null ? (
          <p className={styles.muted}>불러오는 중...</p>
        ) : (
          <form className={styles.formGrid} onSubmit={handleSave}>
            <label className={styles.fieldLabel}>
              1개월 · 소개자 적립금(원)
              <input
                type="number"
                min={0}
                placeholder={String(MAIN_REFERRAL_AMOUNT_DEFAULTS.mainReferrerAmount1mo)}
                value={mainReferrerAmount1mo}
                onChange={(e) => setMainReferrerAmount1mo(e.target.value)}
                disabled={!isDirector}
              />
            </label>
            <label className={styles.fieldLabel}>
              1개월 · 피소개자 할인(원)
              <input
                type="number"
                min={0}
                placeholder={String(MAIN_REFERRAL_AMOUNT_DEFAULTS.mainRefereeAmount1mo)}
                value={mainRefereeAmount1mo}
                onChange={(e) => setMainRefereeAmount1mo(e.target.value)}
                disabled={!isDirector}
              />
            </label>
            <label className={styles.fieldLabel}>
              3개월 · 소개자 적립금(원)
              <input
                type="number"
                min={0}
                placeholder={String(MAIN_REFERRAL_AMOUNT_DEFAULTS.mainReferrerAmount3mo)}
                value={mainReferrerAmount3mo}
                onChange={(e) => setMainReferrerAmount3mo(e.target.value)}
                disabled={!isDirector}
              />
            </label>
            <label className={styles.fieldLabel}>
              3개월 · 피소개자 할인(원)
              <input
                type="number"
                min={0}
                placeholder={String(MAIN_REFERRAL_AMOUNT_DEFAULTS.mainRefereeAmount3mo)}
                value={mainRefereeAmount3mo}
                onChange={(e) => setMainRefereeAmount3mo(e.target.value)}
                disabled={!isDirector}
              />
            </label>
            <button type="submit" disabled={!isDirector || saving}>
              {saving ? "저장 중..." : saved ? "저장됨" : "저장"}
            </button>
            {saveError && <p className={styles.errorText}>{saveError}</p>}
          </form>
        )}
      </div>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>원내 QR 코드</div>
        <p className={styles.muted}>추천코드 없이 들어오는 원내 포스터용 QR입니다. 인쇄해서 데스크/대기실에 부착하세요.</p>
        <QrCodeImage
          value={`${getShareBaseUrl()}/refer/trial`}
          filename="trial-campaign-qr.png"
        />
      </div>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>신청 응답 확인</div>
        <Link href="/refer/applications" className={styles.linkButton}>
          신청 응답 전체보기 →
        </Link>
        <Link href="/refer/main-registrations" className={styles.linkButton}>
          본프로그램 바로등록 신청 전체보기 →
        </Link>
      </div>
    </div>
  );
}
