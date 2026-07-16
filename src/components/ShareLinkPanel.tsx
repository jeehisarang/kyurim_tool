"use client";

import { useEffect, useState } from "react";
import styles from "./ShareLinkPanel.module.css";
import ProgramTeachingCreator from "@/components/ProgramTeachingCreator";
import { getCurrentUserId } from "@/lib/currentUser";
import { copyToClipboard } from "@/lib/clipboard";
import { EXAM_TYPE_LABEL, weightCell, gripLabel, hrvSummaryLabel, formatExamDate, type ExaminationRow } from "@/lib/examination-format";

// 링크에 포함된 3개 축(티칭/이벤트/검사결과, task.md) — 서로 독립적으로 0개 이상 조합 가능.
// 복사 시 어떤 안내문구를 붙일지 결정하는 데 쓰인다.
export type ShareLinkFlags = { hasTeaching: boolean; hasEvent: boolean; hasExam: boolean };

function comboKey(f: ShareLinkFlags): string {
  return `${f.hasTeaching ? "T" : ""}${f.hasEvent ? "E" : ""}${f.hasExam ? "X" : ""}`;
}

// 링크 자동첨부 시 앞에 붙는 고정 안내문구(task.md) — AI 호출 없이 환자 이름만 치환.
// 조합별로 자연스러운 한국어 조사를 그대로 고정 문구로 써서(동적 조립 시 조사 오류 위험 방지)
// ShareLinkPanel을 쓰는 화면(TalkStudioPanel/TalkGroupManager)이 공통으로 재사용한다.
const INTRO_BY_COMBO: Record<string, (patientName: string) => string> = {
  T: (name) => `${name}님의 검사 결과와 추천 프로그램을 아래 링크에서 확인해보세요 🙂`,
  E: (name) => `${name}님을 위한 특별한 혜택을 아래 링크에서 확인해보세요 🙂`,
  X: (name) => `${name}님의 검사 결과를 아래 링크에서 확인해보세요 🙂`,
  TE: (name) => `${name}님의 검사 결과와 추천 혜택을 아래 링크에서 확인해보세요 🙂`,
  TX: (name) => `${name}님의 검사 결과와 추천 프로그램을 아래 링크에서 확인해보세요 🙂`,
  EX: (name) => `${name}님의 검사 결과와 특별한 혜택을 아래 링크에서 확인해보세요 🙂`,
  TEX: (name) => `${name}님의 검사 결과와 추천 프로그램, 특별한 혜택을 아래 링크에서 확인해보세요 🙂`,
};

export function buildShareLinkIntro(patientName: string, flags: ShareLinkFlags): string {
  const combo = INTRO_BY_COMBO[comboKey(flags)];
  return combo ? combo(patientName) : INTRO_BY_COMBO.X(patientName);
}

type TeachingSummary = { id: number; token: string; programName: string; createdAt: string };
type EventSummary = { id: number; finalTitle: string };

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
}

function examRowSummary(row: ExaminationRow): string {
  if (row.examType === "BODY_COMPOSITION") return weightCell(row);
  if (row.examType === "STRENGTH_TEST") return gripLabel(row);
  return hrvSummaryLabel(row);
}

function examRowKey(row: ExaminationRow): string {
  return `${row.examType}:${row.id}`;
}

/**
 * 톡생성기 "링크 포함하기" 패널(14-11, 검사톡 확장 task.md) — 프로그램티칭/이벤트/검사기록
 * 3개 축을 각각 독립적으로 0개 이상 골라 하나의 링크로 묶어 부모(TalkStudioPanel)에 전달한다.
 * 부모는 이 URL을 톡 문구 복사 시 하단에 자동으로 붙여준다(copy-time 결합 — 편집 중인 초안
 * 텍스트 자체에는 끼워 넣지 않아, 다시 생성하거나 편집해도 중복/꼬임이 생기지 않는다).
 *
 * "프로그램티칭 새로 만들기"는 기존 ProgramTeachingCreator를 그대로 재사용한다(defaultOpen로
 * 바로 펼친 채 인라인 임베드, onCreated로 방금 만든 티칭지를 드롭다운에 자동 선택) — 별도
 * 페이지 이동 없이 같은 화면에서 완결되므로, 생성 도중 다른 탭/페이지로 이탈해 링크를
 * 놓치는 유실 경로 자체가 생기지 않는다.
 *
 * 검사기록 체크리스트는 /api/examinations?patientId=(이미 인바디/근력/HRV 3종을 통합 반환)를
 * 그대로 재사용한다 — 종류별 최신 1건만 기본 체크, 과거 기록도 목록엔 보이되 미체크로 둔다.
 */
export default function ShareLinkPanel({
  patientId,
  onLinkGenerated,
}: {
  patientId: number;
  onLinkGenerated: (url: string, flags: ShareLinkFlags) => void;
}) {
  const [includeTeaching, setIncludeTeaching] = useState(false);
  const [includeEvent, setIncludeEvent] = useState(false);
  const [includeExam, setIncludeExam] = useState(false);

  const [teachingList, setTeachingList] = useState<TeachingSummary[] | null>(null);
  const [selectedTeachingId, setSelectedTeachingId] = useState<number | null>(null);
  const [showInlineCreator, setShowInlineCreator] = useState(false);

  const [eventList, setEventList] = useState<EventSummary[] | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null);

  const [examRows, setExamRows] = useState<ExaminationRow[] | null>(null);
  const [checkedExamKeys, setCheckedExamKeys] = useState<Set<string>>(new Set());

  const [creatingLink, setCreatingLink] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!includeTeaching || teachingList !== null) return;
    fetch(`/api/patients/${patientId}/teaching-pages`)
      .then((res) => res.json())
      .then(setTeachingList);
  }, [includeTeaching, teachingList, patientId]);

  useEffect(() => {
    if (!includeEvent || eventList !== null) return;
    fetch(`/api/event-images?activeOnly=1`)
      .then((res) => res.json())
      .then(setEventList);
  }, [includeEvent, eventList]);

  useEffect(() => {
    if (!includeExam || examRows !== null) return;
    fetch(`/api/examinations?patientId=${patientId}`)
      .then((res) => res.json())
      .then((rows: ExaminationRow[]) => {
        const sorted = [...rows].sort((a, b) => b.examDate.localeCompare(a.examDate));
        setExamRows(sorted);
        // 검사 종류별 최신 1건만 기본 체크(task.md 제안) — sorted가 examDate 내림차순이라
        // 종류별로 처음 만나는 행이 그 종류의 최신 기록이다.
        const seenTypes = new Set<string>();
        const defaultChecked = new Set<string>();
        for (const row of sorted) {
          if (seenTypes.has(row.examType)) continue;
          seenTypes.add(row.examType);
          defaultChecked.add(examRowKey(row));
        }
        setCheckedExamKeys(defaultChecked);
      });
  }, [includeExam, examRows, patientId]);

  function toggleExamRow(key: string) {
    setCheckedExamKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function handleTeachingCreated(page: { id: number; token: string; programName: string }) {
    setTeachingList((prev) => [
      { id: page.id, token: page.token, programName: page.programName, createdAt: new Date().toISOString() },
      ...(prev ?? []),
    ]);
    setSelectedTeachingId(page.id);
    setShowInlineCreator(false);
  }

  const teachingReady = !includeTeaching || selectedTeachingId !== null;
  const eventReady = !includeEvent || selectedEventId !== null;
  const hasAnyContent =
    (includeTeaching && selectedTeachingId !== null) ||
    (includeEvent && selectedEventId !== null) ||
    (includeExam && checkedExamKeys.size > 0);
  const canGenerate = teachingReady && eventReady && hasAnyContent;

  function resetResult() {
    setLinkError(null);
    setResultUrl(null);
  }

  async function handleGenerateLink() {
    const createdByStaffId = getCurrentUserId();
    if (!createdByStaffId) {
      setLinkError("상단에서 현재 사용자를 먼저 선택하세요.");
      return;
    }
    setCreatingLink(true);
    setLinkError(null);
    try {
      const examRecords = includeExam
        ? [...checkedExamKeys].map((key) => {
            const [examType, idStr] = key.split(":");
            return { examType, examRecordId: Number(idStr) };
          })
        : [];

      const res = await fetch("/api/share-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId,
          teachingPageId: includeTeaching ? selectedTeachingId : null,
          eventImageId: includeEvent ? selectedEventId : null,
          examRecords,
          createdByStaffId,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setLinkError(data.error ?? "공유링크 생성에 실패했습니다.");
        return;
      }
      const baseUrl = process.env.NEXT_PUBLIC_SHARE_BASE_URL || window.location.origin;
      const url = `${baseUrl}/s/${data.token}`;
      setResultUrl(url);
      onLinkGenerated(url, {
        hasTeaching: includeTeaching && selectedTeachingId !== null,
        hasEvent: includeEvent && selectedEventId !== null,
        hasExam: includeExam && examRecords.length > 0,
      });
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

  const examByType = new Map<string, ExaminationRow[]>();
  if (examRows) {
    for (const row of examRows) {
      const list = examByType.get(row.examType) ?? [];
      list.push(row);
      examByType.set(row.examType, list);
    }
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.sectionLabel}>링크 포함하기</div>

      <div className={styles.modeRow}>
        <label className={styles.modeOption}>
          <input
            type="checkbox"
            checked={includeTeaching}
            onChange={(e) => {
              setIncludeTeaching(e.target.checked);
              resetResult();
            }}
          />
          프로그램티칭
        </label>
        <label className={styles.modeOption}>
          <input
            type="checkbox"
            checked={includeEvent}
            onChange={(e) => {
              setIncludeEvent(e.target.checked);
              resetResult();
            }}
          />
          이벤트
        </label>
        <label className={styles.modeOption}>
          <input
            type="checkbox"
            checked={includeExam}
            onChange={(e) => {
              setIncludeExam(e.target.checked);
              resetResult();
            }}
          />
          검사결과(검사톡)
        </label>
      </div>

      {includeTeaching && (
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

      {includeEvent && (
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

      {includeExam && (
        <div className={styles.examChecklist}>
          {examRows === null ? (
            <span className={styles.muted}>불러오는 중...</span>
          ) : examRows.length === 0 ? (
            <span className={styles.muted}>등록된 검사기록이 없습니다.</span>
          ) : (
            [...examByType.entries()].map(([examType, rows]) => (
              <div key={examType} className={styles.examTypeGroup}>
                <div className={styles.examTypeLabel}>
                  {EXAM_TYPE_LABEL[examType as keyof typeof EXAM_TYPE_LABEL] ?? examType}
                </div>
                {rows.map((row) => (
                  <label key={examRowKey(row)} className={styles.examRow}>
                    <input
                      type="checkbox"
                      checked={checkedExamKeys.has(examRowKey(row))}
                      onChange={() => toggleExamRow(examRowKey(row))}
                    />
                    <span className={styles.examRowDate}>{formatExamDate(row.examDate)}</span>
                    <span className={styles.examRowSummary}>{examRowSummary(row)}</span>
                  </label>
                ))}
              </div>
            ))
          )}
        </div>
      )}

      {linkError && <p className={styles.errorText}>{linkError}</p>}

      {(includeTeaching || includeEvent || includeExam) && (
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
