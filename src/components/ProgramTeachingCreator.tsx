"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./ProgramTeachingCreator.module.css";
import { getCurrentUserId } from "@/lib/currentUser";
import { copyToClipboard } from "@/lib/clipboard";

type ProgramTeaching = {
  id: number;
  programName: string;
  targetSymptomKeywords: string | null;
  linkedTestType: "BODY_COMPOSITION" | "STRENGTH_TEST" | null;
};

type CreatedPage = {
  token: string;
  aiPersonalizedText: string;
  programName: string;
  testValueSummary: string | null;
  supportImagePath: string | null;
};

/**
 * 톡 생성 화면(TalkStudioPanel)에서 환자 선택 후 노출되는 "프로그램 티칭지 만들기"
 * 플로우(14-2, 프로그램 중심) — 프로그램 선택 → (검사연결 프로그램이면 검사이력 확인) →
 * AI 개인화 문구 생성 → 링크 발급/복사까지 완결된다. 자동 발송은 하지 않는다.
 */
export default function ProgramTeachingCreator({ patientId }: { patientId: number }) {
  const [open, setOpen] = useState(false);
  const [programs, setPrograms] = useState<ProgramTeaching[] | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [needsExamNotice, setNeedsExamNotice] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedPage | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open || programs !== null) return;
    fetch("/api/program-teaching?activeOnly=1")
      .then((res) => res.json())
      .then(setPrograms);
  }, [open, programs]);

  const selectedProgram = useMemo(
    () => programs?.find((p) => p.id === selectedId) ?? null,
    [programs, selectedId],
  );

  function reset() {
    setSelectedId(null);
    setCreated(null);
    setGenerateError(null);
    setNeedsExamNotice(null);
  }

  function toggleOpen() {
    setOpen((prev) => !prev);
    reset();
  }

  function selectProgram(id: number) {
    setSelectedId(id);
    setGenerateError(null);
    setNeedsExamNotice(null);
  }

  async function handleCreate() {
    if (!selectedId) return;
    const createdByStaffId = getCurrentUserId();
    if (!createdByStaffId) {
      setGenerateError("상단에서 현재 사용자를 먼저 선택하세요.");
      return;
    }
    setGenerating(true);
    setGenerateError(null);
    setNeedsExamNotice(null);
    try {
      const res = await fetch("/api/teaching-pages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientId, programTeachingId: selectedId, createdByStaffId }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.needsExam) {
          setNeedsExamNotice(data.error);
        } else {
          setGenerateError(data.error ?? "티칭지 생성에 실패했습니다.");
        }
        return;
      }
      setCreated(data);
    } catch {
      setGenerateError("서버에 연결하지 못했습니다. 다시 시도해주세요.");
    } finally {
      setGenerating(false);
    }
  }

  async function handleCopyLink() {
    if (!created) return;
    const url = `${window.location.origin}/p/${created.token}`;
    const success = await copyToClipboard(url);
    if (!success) {
      alert("복사에 실패했습니다. 링크를 직접 선택해서 복사해주세요.");
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className={styles.wrap}>
      <button type="button" className={styles.toggleButton} onClick={toggleOpen}>
        {open ? "프로그램 티칭지 만들기 닫기" : "프로그램 티칭지 만들기"}
      </button>

      {open && (
        <div className={styles.panel}>
          {!created && (
            <>
              <div className={styles.sectionLabel}>프로그램 선택</div>

              {programs === null ? (
                <p className={styles.muted}>불러오는 중...</p>
              ) : programs.length === 0 ? (
                <p className={styles.muted}>
                  등록된 프로그램이 없습니다. 설정 &gt; 프로그램 티칭 관리에서 먼저 등록하세요.
                </p>
              ) : (
                <ul className={styles.resultList}>
                  {programs.map((p) => (
                    <li
                      key={p.id}
                      className={selectedId === p.id ? styles.resultItemActive : styles.resultItem}
                      onClick={() => selectProgram(p.id)}
                    >
                      <span>{p.programName}</span>
                      {p.targetSymptomKeywords && (
                        <span className={styles.resultKeywords}>{p.targetSymptomKeywords}</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              {needsExamNotice && <p className={styles.noticeText}>{needsExamNotice}</p>}
              {generateError && <p className={styles.errorText}>{generateError}</p>}

              <button
                type="button"
                className={styles.generateButton}
                onClick={handleCreate}
                disabled={!selectedProgram || generating}
              >
                {generating ? "생성 중..." : "선택 확정 및 티칭지 생성"}
              </button>
            </>
          )}

          {created && (
            <div className={styles.previewBox}>
              <div className={styles.sectionLabel}>{created.programName} — 티칭지 생성 완료</div>
              {created.testValueSummary && (
                <p className={styles.testValueText}>검사수치: {created.testValueSummary}</p>
              )}
              <p className={styles.previewText}>{created.aiPersonalizedText}</p>
              {created.supportImagePath && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={created.supportImagePath} alt="" className={styles.thumbnail} />
              )}
              <div className={styles.previewActions}>
                <button type="button" className={styles.generateButton} onClick={handleCopyLink}>
                  {copied ? "링크 복사됨" : "링크 복사"}
                </button>
                <button type="button" className={styles.resetButton} onClick={reset}>
                  다른 프로그램으로 새로 만들기
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
