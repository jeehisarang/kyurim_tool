"use client";

import { useEffect, useState } from "react";
import styles from "./ShareLinkPanel.module.css";
import ProgramTeachingCreator from "@/components/ProgramTeachingCreator";
import { getCurrentUserId } from "@/lib/currentUser";
import { copyToClipboard } from "@/lib/clipboard";

// NONE을 제외한 실제 링크 생성 모드 — 부모(TalkStudioPanel)가 안내문구 템플릿을
// 고르는 데 사용한다(task.md).
export type ShareLinkMode = "TEACHING" | "EVENT" | "COMBO";
type LinkMode = "NONE" | ShareLinkMode;

const MODE_OPTIONS: { key: LinkMode; label: string }[] = [
  { key: "NONE", label: "없음" },
  { key: "TEACHING", label: "프로그램티칭" },
  { key: "EVENT", label: "이벤트" },
  { key: "COMBO", label: "통합" },
];

// 링크 자동첨부 시 앞에 붙는 고정 안내문구(task.md) — AI 호출 없이 환자 이름만 치환.
// ShareLinkPanel을 쓰는 화면(TalkStudioPanel/TalkGroupManager)이 공통으로 재사용한다.
export const SHARE_LINK_INTRO: Record<ShareLinkMode, (patientName: string) => string> = {
  TEACHING: (name) => `${name}님의 검사 결과와 추천 프로그램을 아래 링크에서 확인해보세요 🙂`,
  EVENT: (name) => `${name}님을 위한 특별한 혜택을 아래 링크에서 확인해보세요 🙂`,
  COMBO: (name) => `${name}님의 검사 결과와 추천 혜택을 아래 링크에서 확인해보세요 🙂`,
};

type TeachingSummary = { id: number; token: string; programName: string; createdAt: string };
type EventSummary = { id: number; finalTitle: string };

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
}

/**
 * 톡생성기 "링크 포함하기" 패널(14-11) — 프로그램티칭/이벤트/통합 URL을 선택적으로 만들어
 * 부모(TalkStudioPanel)에 전달한다. 부모는 이 URL을 톡 문구 복사 시 하단에 자동으로
 * 붙여준다(copy-time 결합 — 편집 중인 초안 텍스트 자체에는 끼워 넣지 않아, 다시 생성하거나
 * 편집해도 중복/꼬임이 생기지 않는다).
 *
 * "프로그램티칭 새로 만들기"는 기존 ProgramTeachingCreator를 그대로 재사용한다(defaultOpen로
 * 바로 펼친 채 인라인 임베드, onCreated로 방금 만든 티칭지를 드롭다운에 자동 선택) — 별도
 * 페이지 이동 없이 같은 화면에서 완결되므로, 생성 도중 다른 탭/페이지로 이탈해 링크를
 * 놓치는 유실 경로 자체가 생기지 않는다.
 */
export default function ShareLinkPanel({
  patientId,
  onLinkGenerated,
}: {
  patientId: number;
  onLinkGenerated: (url: string, mode: ShareLinkMode) => void;
}) {
  const [mode, setMode] = useState<LinkMode>("NONE");

  const [teachingList, setTeachingList] = useState<TeachingSummary[] | null>(null);
  const [selectedTeachingId, setSelectedTeachingId] = useState<number | null>(null);
  const [showInlineCreator, setShowInlineCreator] = useState(false);

  const [eventList, setEventList] = useState<EventSummary[] | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null);

  const [creatingLink, setCreatingLink] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const needsTeaching = mode === "TEACHING" || mode === "COMBO";
  const needsEvent = mode === "EVENT" || mode === "COMBO";

  useEffect(() => {
    if (!needsTeaching || teachingList !== null) return;
    fetch(`/api/patients/${patientId}/teaching-pages`)
      .then((res) => res.json())
      .then(setTeachingList);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsTeaching, teachingList]);

  useEffect(() => {
    if (!needsEvent || eventList !== null) return;
    fetch(`/api/event-images?activeOnly=1`)
      .then((res) => res.json())
      .then(setEventList);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsEvent, eventList]);

  function selectMode(next: LinkMode) {
    setMode(next);
    setLinkError(null);
    setResultUrl(null);
  }

  function handleTeachingCreated(page: { id: number; token: string; programName: string }) {
    setTeachingList((prev) => [
      { id: page.id, token: page.token, programName: page.programName, createdAt: new Date().toISOString() },
      ...(prev ?? []),
    ]);
    setSelectedTeachingId(page.id);
    setShowInlineCreator(false);
  }

  const canGenerate =
    mode !== "NONE" &&
    (!needsTeaching || selectedTeachingId !== null) &&
    (!needsEvent || selectedEventId !== null);

  async function handleGenerateLink() {
    if (mode === "NONE") return;
    const createdByStaffId = getCurrentUserId();
    if (!createdByStaffId) {
      setLinkError("상단에서 현재 사용자를 먼저 선택하세요.");
      return;
    }
    setCreatingLink(true);
    setLinkError(null);
    try {
      const res = await fetch("/api/share-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId,
          teachingPageId: needsTeaching ? selectedTeachingId : null,
          eventImageId: needsEvent ? selectedEventId : null,
          createdByStaffId,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setLinkError(data.error ?? "공유링크 생성에 실패했습니다.");
        return;
      }
      const url = `${window.location.origin}/s/${data.token}`;
      setResultUrl(url);
      onLinkGenerated(url, mode);
    } catch {
      setLinkError("서버에 연결하지 못했습니다. 다시 시도해주세요.");
    } finally {
      setCreatingLink(false);
    }
  }

  async function handleCopyUrl() {
    if (!resultUrl) return;
    const success = await copyToClipboard(resultUrl);
    if (!success) {
      alert("복사에 실패했습니다. 링크를 직접 선택해서 복사해주세요.");
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.sectionLabel}>링크 포함하기</div>

      <div className={styles.modeRow}>
        {MODE_OPTIONS.map((opt) => (
          <label key={opt.key} className={styles.modeOption}>
            <input
              type="radio"
              name="share-link-mode"
              checked={mode === opt.key}
              onChange={() => selectMode(opt.key)}
            />
            {opt.label}
          </label>
        ))}
      </div>

      {needsTeaching && (
        <>
          <div className={styles.selectRow}>
            {teachingList === null ? (
              <span className={styles.muted}>불러오는 중...</span>
            ) : (
              <select
                className={styles.select}
                value={selectedTeachingId ?? ""}
                onChange={(e) => setSelectedTeachingId(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">티칭지 선택</option>
                {teachingList.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.programName} ({formatDate(t.createdAt)})
                  </option>
                ))}
              </select>
            )}
            <button
              type="button"
              className={styles.smallButton}
              onClick={() => setShowInlineCreator((prev) => !prev)}
            >
              {showInlineCreator ? "닫기" : "새로 만들기"}
            </button>
          </div>

          {showInlineCreator && (
            <div className={styles.inlineCreator}>
              <ProgramTeachingCreator patientId={patientId} defaultOpen onCreated={handleTeachingCreated} />
            </div>
          )}
        </>
      )}

      {needsEvent && (
        <div className={styles.selectRow}>
          {eventList === null ? (
            <span className={styles.muted}>불러오는 중...</span>
          ) : eventList.length === 0 ? (
            <span className={styles.muted}>등록된 활성 이벤트가 없습니다.</span>
          ) : (
            <select
              className={styles.select}
              value={selectedEventId ?? ""}
              onChange={(e) => setSelectedEventId(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">이벤트 선택</option>
              {eventList.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.finalTitle || `(제목 없음 #${ev.id})`}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {linkError && <p className={styles.errorText}>{linkError}</p>}

      {mode !== "NONE" && (
        <button
          type="button"
          className={styles.generateButton}
          onClick={handleGenerateLink}
          disabled={!canGenerate || creatingLink}
        >
          {creatingLink ? "생성 중..." : "링크 생성"}
        </button>
      )}

      {resultUrl && (
        <div className={styles.resultBox}>
          <p className={styles.resultUrl}>{resultUrl}</p>
          <div className={styles.resultActions}>
            <button type="button" className={styles.smallButton} onClick={handleCopyUrl}>
              {copied ? "복사됨" : "링크만 복사"}
            </button>
            <span className={styles.resultNote}>아래 톡 문구 복사 시 이 링크가 자동으로 함께 복사됩니다.</span>
          </div>
        </div>
      )}
    </div>
  );
}
