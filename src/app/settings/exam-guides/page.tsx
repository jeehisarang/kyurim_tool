"use client";

import { useEffect, useState } from "react";
import styles from "./page.module.css";
import BackButton from "@/components/BackButton";
import { useCurrentUserContext } from "@/lib/CurrentUserContext";

type ExamAcademicGuide = { examType: string; content: string; updatedAt: string } | null;

const EXAM_TYPE_LABEL: Record<string, string> = { HRV: "자율신경맥파기(HRV)" };

/**
 * 검사종류별 학술 근거 관리 화면(task2.md) — 원장 전용. 여기 작성한 내용이 AI 해설 생성의
 * 입력재료로 그대로 쓰이므로(hrv-explanation.ts), 잘못된 내용이 환자에게 노출되지 않도록
 * 원장만 수정 가능하다(programs 등록화면과 동일한 서버단 재검증 패턴).
 */
export default function ExamGuidesSettingsPage() {
  const { currentUser } = useCurrentUserContext();
  const isDirector = currentUser?.role === "원장";

  const examType = "HRV";
  const [guide, setGuide] = useState<ExamAcademicGuide>(null);
  const [content, setContent] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch(`/api/exam-guides/${examType}`)
      .then((res) => res.json())
      .then((data: ExamAcademicGuide) => {
        setGuide(data);
        setContent(data?.content ?? "");
        setLoaded(true);
      });
  }, []);

  async function handleSave() {
    if (!currentUser) return;
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      const res = await fetch(`/api/exam-guides/${examType}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staffUserId: currentUser.id, content }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSaveError(data.error ?? "저장에 실패했습니다.");
        return;
      }
      setGuide(data);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setSaveError("서버에 연결하지 못했습니다. 다시 시도해주세요.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.titleRow}>
        <BackButton />
        <h1 className={styles.pageTitle}>검사 학술근거 관리</h1>
      </div>
      <p className={styles.muted}>
        여기 작성한 내용이 검사 결과 AI 해설 생성의 입력재료로 쓰입니다. AI는 이 내용을
        환자 친화적으로 재구성만 할 뿐, 여기 없는 새로운 의학적 효능/통계를 만들어내지
        않습니다.
      </p>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>{EXAM_TYPE_LABEL[examType]}</div>
        {!isDirector && <p className={styles.errorText}>원장만 학술 근거를 수정할 수 있습니다.</p>}

        {!loaded ? (
          <p className={styles.muted}>불러오는 중...</p>
        ) : (
          <>
            <textarea
              className={styles.contentTextarea}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              disabled={!isDirector}
              placeholder="예: 자율신경맥파기(HRV) 검사는 자율신경 균형과 혈관 탄성도를 측정하여..."
              rows={10}
            />
            {guide && (
              <p className={styles.muted}>
                마지막 수정: {new Date(guide.updatedAt).toLocaleString("ko-KR")}
              </p>
            )}
            <button
              type="button"
              className={styles.saveButton}
              onClick={handleSave}
              disabled={!isDirector || saving}
            >
              {saving ? "저장 중..." : saved ? "저장됨" : "저장"}
            </button>
            {saveError && <p className={styles.errorText}>{saveError}</p>}
          </>
        )}
      </div>
    </div>
  );
}
