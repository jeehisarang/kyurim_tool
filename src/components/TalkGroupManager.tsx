"use client";

import { useEffect, useState } from "react";
import styles from "@/app/messages/page.module.css";
import cardStyles from "./TalkGroupManager.module.css";
import SealStamp from "@/components/SealStamp";
import { getCurrentUserId } from "@/lib/currentUser";
import { copyToClipboard } from "@/lib/clipboard";
import { TALK_MESSAGE_TYPE_LABEL, TRIAL_TASK_TYPE_LABEL } from "@/lib/message-templates";

type StaffUserLite = { id: number; name: string; role: string };
type ProgressLevel = "HIGH" | "MID" | "LOW";

type Candidate = {
  id: number;
  taskType: string;
  dueDate: string;
  patient: { id: number; name: string; chartNumber: string };
  program: { id: number; name: string } | null;
  sourceLabel: string;
  staffUser: StaffUserLite | null;
  isDone: boolean;
  doneByUser: StaffUserLite | null;
  skippedAt: string | null;
  skippedByUser: StaffUserLite | null;
  draftContent: string | null;
  internalAnalysis: string | null;
};

const TASK_TYPE_LABEL: Record<string, string> = {
  ...TALK_MESSAGE_TYPE_LABEL,
  ...TRIAL_TASK_TYPE_LABEL,
};

// 2일톡/7일톡/3회차톡 보류 가능 — /todo, /messages와 동일 규칙(task2.md 확인/수정 요청으로
// 2일톡/3회차톡도 수동 즉시 보류 가능하도록 확장).
const SKIPPABLE_TASK_TYPES = ["DAY2", "DAY7", "THIRD_VISIT"];

const PROGRESS_LEVEL_LABEL: Record<ProgressLevel, string> = {
  HIGH: "상 (60%↑)",
  MID: "중 (30~50%)",
  LOW: "하 (0~30%)",
};

/**
 * "톡 관리" 화면 — 한 환자의 오늘 날짜 기준 톡 후보(내원기반+프로그램기반)를
 * 우선순위 계산 없이 모두 체크리스트로 보여주고, 선택한 것만 문구를 생성한다.
 * 완료체크는 개별 항목 옆에 그대로 남겨둬서 "이건 오늘 안 보내기로 함" 판단도 가능하게 한다.
 */
export default function TalkGroupManager({ patientId, date }: { patientId: number; date: string }) {
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [drafts, setDrafts] = useState<Record<number, { message: string; internalAnalysis: string }>>({});
  const [extraKeywords, setExtraKeywords] = useState<Record<number, string>>({});
  const [progressLevels, setProgressLevels] = useState<Record<number, ProgressLevel>>({});
  const [generatingIds, setGeneratingIds] = useState<Set<number>>(new Set());
  const [generateErrors, setGenerateErrors] = useState<Record<number, string>>({});
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [stampId, setStampId] = useState<number | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    fetch(`/api/todo-tasks/patient-group?patientId=${patientId}&date=${date}`)
      .then((res) => res.json())
      .then((data: Candidate[]) => {
        setCandidates(data);
        setDrafts((prev) => {
          const next = { ...prev };
          for (const c of data) {
            if (!next[c.id]) {
              next[c.id] = { message: c.draftContent ?? "", internalAnalysis: c.internalAnalysis ?? "" };
            }
          }
          return next;
        });
      });
  }, [patientId, date, refreshKey]);

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function generateFor(candidate: Candidate) {
    setGeneratingIds((prev) => new Set(prev).add(candidate.id));
    setGenerateErrors((prev) => {
      const next = { ...prev };
      delete next[candidate.id];
      return next;
    });
    try {
      if (candidate.program) {
        const res = await fetch("/api/program-events/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ todoTaskId: candidate.id }),
        });
        const data = await res.json();
        if (!res.ok) {
          setGenerateErrors((prev) => ({ ...prev, [candidate.id]: data.error ?? "문구 생성에 실패했습니다." }));
          return;
        }
        setDrafts((prev) => ({
          ...prev,
          [candidate.id]: { message: data.patientMessage, internalAnalysis: data.internalAnalysis ?? "" },
        }));
      } else {
        const res = await fetch("/api/messages/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            patientId: candidate.patient.id,
            messageType: candidate.taskType,
            extraKeywords: extraKeywords[candidate.id] || undefined,
            progressLevel: candidate.taskType === "THIRD_VISIT" ? (progressLevels[candidate.id] ?? "MID") : undefined,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setGenerateErrors((prev) => ({ ...prev, [candidate.id]: data.error ?? "문구 생성에 실패했습니다." }));
          return;
        }
        setDrafts((prev) => ({ ...prev, [candidate.id]: { message: data.content, internalAnalysis: "" } }));
      }
    } catch {
      setGenerateErrors((prev) => ({
        ...prev,
        [candidate.id]: "서버에 연결하지 못했습니다. 다시 시도해주세요.",
      }));
    } finally {
      setGeneratingIds((prev) => {
        const next = new Set(prev);
        next.delete(candidate.id);
        return next;
      });
    }
  }

  async function handleGenerateSelected() {
    if (!candidates) return;
    const targets = candidates.filter((c) => selected.has(c.id));
    await Promise.all(targets.map((c) => generateFor(c)));
  }

  async function handleCopy(id: number) {
    const text = drafts[id]?.message ?? "";
    if (!text) return;
    const success = await copyToClipboard(text);
    if (!success) {
      alert("복사에 실패했습니다. 텍스트를 직접 선택해서 복사해주세요.");
      return;
    }
    setCopiedId(id);
    setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 1500);
  }

  async function handleConfirm(candidate: Candidate) {
    const staffUserId = getCurrentUserId();
    if (!staffUserId) {
      alert("상단에서 현재 사용자를 먼저 선택하세요.");
      return;
    }
    const draft = drafts[candidate.id];

    try {
      const res = await fetch(`/api/todo-tasks/${candidate.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          doneByUserId: staffUserId,
          action: "DONE",
          patientMessage: draft?.message,
          internalAnalysis: draft?.internalAnalysis,
        }),
      });
      if (!res.ok) {
        alert("완료 처리에 실패했습니다. 다시 시도해주세요.");
        return;
      }
      setStampId(candidate.id);
      setRefreshKey((k) => k + 1);
    } catch {
      alert("서버에 연결하지 못했습니다. 완료 처리되지 않았으니 다시 시도해주세요.");
    }
  }

  async function handleSkip(candidate: Candidate) {
    const staffUserId = getCurrentUserId();
    if (!staffUserId) {
      alert("상단에서 현재 사용자를 먼저 선택하세요.");
      return;
    }

    try {
      const res = await fetch(`/api/todo-tasks/${candidate.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doneByUserId: staffUserId, action: "SKIPPED" }),
      });
      if (!res.ok) {
        alert("보류 처리에 실패했습니다. 다시 시도해주세요.");
        return;
      }
      setRefreshKey((k) => k + 1);
    } catch {
      alert("서버에 연결하지 못했습니다. 보류 처리되지 않았으니 다시 시도해주세요.");
    }
  }

  if (candidates === null) return <p className={styles.muted}>불러오는 중...</p>;
  if (candidates.length === 0) return <p className={styles.muted}>오늘 해당되는 톡이 없습니다.</p>;

  const selectedCandidates = candidates.filter((c) => selected.has(c.id));

  return (
    <div>
      <ul className={cardStyles.checklist}>
        {candidates.map((c) => {
          const resolved = c.isDone || !!c.skippedAt;
          return (
            <li
              key={c.id}
              className={resolved ? `${cardStyles.checklistItem} ${cardStyles.checklistItemResolved}` : cardStyles.checklistItem}
            >
              <label className={cardStyles.checklistLeft}>
                <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} />
                <span className={cardStyles.sourceBadge}>{c.sourceLabel}</span>
                <span>{TASK_TYPE_LABEL[c.taskType] ?? c.taskType}</span>
                <span>
                  {c.isDone
                    ? `완료됨 (${c.doneByUser?.name ?? "-"})`
                    : c.skippedAt
                      ? `보류됨 (${c.skippedByUser?.name ?? "-"})`
                      : "미발송"}
                </span>
              </label>
              <span className={cardStyles.checklistRight}>
                <span className={styles.submitWrap}>
                  <button type="button" className={cardStyles.checkButton} onClick={() => handleConfirm(c)}>
                    완료체크
                  </button>
                  {stampId === c.id && <SealStamp key={c.id} />}
                </span>
                {SKIPPABLE_TASK_TYPES.includes(c.taskType) && !c.isDone && (
                  <button type="button" className={cardStyles.skipButton} onClick={() => handleSkip(c)}>
                    보류
                  </button>
                )}
              </span>
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        className={cardStyles.generateAllButton}
        onClick={handleGenerateSelected}
        disabled={selected.size === 0}
      >
        선택 문구 생성 ({selected.size}건)
      </button>

      {selectedCandidates.length > 0 && (
        <div className={styles.messageList}>
          {selectedCandidates.map((c) => (
            <div key={c.id} className={styles.messageCard}>
              <div className={styles.messageHeader}>
                <span className={styles.messageTypeLabel}>
                  {c.sourceLabel} · {TASK_TYPE_LABEL[c.taskType] ?? c.taskType}
                </span>
                <span
                  className={c.isDone ? styles.sentBadge : c.skippedAt ? styles.skippedBadge : styles.unsentBadge}
                >
                  {c.isDone
                    ? `발송함 (${c.doneByUser?.name ?? "-"})`
                    : c.skippedAt
                      ? `보류됨 (${c.skippedByUser?.name ?? "-"})`
                      : "발송안함"}
                </span>
              </div>

              {generateErrors[c.id] && <p className={styles.errorText}>{generateErrors[c.id]}</p>}

              {!c.program && (
                <div className={styles.generationOptions}>
                  <input
                    type="text"
                    className={styles.keywordInput}
                    placeholder="이번 발송에만 참고할 추가 키워드 (선택)"
                    value={extraKeywords[c.id] ?? ""}
                    onChange={(e) => setExtraKeywords((prev) => ({ ...prev, [c.id]: e.target.value }))}
                  />
                  {c.taskType === "THIRD_VISIT" && (
                    <select
                      className={styles.progressSelect}
                      value={progressLevels[c.id] ?? "MID"}
                      onChange={(e) =>
                        setProgressLevels((prev) => ({ ...prev, [c.id]: e.target.value as ProgressLevel }))
                      }
                    >
                      {(Object.keys(PROGRESS_LEVEL_LABEL) as ProgressLevel[]).map((level) => (
                        <option key={level} value={level}>
                          호전도: {PROGRESS_LEVEL_LABEL[level]}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              <textarea
                className={styles.messageTextarea}
                value={drafts[c.id]?.message ?? ""}
                onChange={(e) =>
                  setDrafts((prev) => ({
                    ...prev,
                    [c.id]: { message: e.target.value, internalAnalysis: prev[c.id]?.internalAnalysis ?? "" },
                  }))
                }
                placeholder="문구 생성 버튼을 눌러주세요."
                rows={3}
              />

              {c.program && (
                <div className={styles.notesBlock}>
                  <div>원장용 메모 (환자에게 발송되지 않음)</div>
                  <textarea
                    className={styles.messageTextarea}
                    value={drafts[c.id]?.internalAnalysis ?? ""}
                    onChange={(e) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [c.id]: { message: prev[c.id]?.message ?? "", internalAnalysis: e.target.value },
                      }))
                    }
                    placeholder="문구 생성 시 함께 채워집니다."
                    rows={2}
                  />
                </div>
              )}

              <div className={styles.messageActions}>
                <button
                  type="button"
                  className={styles.actionButton}
                  onClick={() => generateFor(c)}
                  disabled={generatingIds.has(c.id)}
                >
                  {generatingIds.has(c.id) ? "생성 중..." : "문구 생성"}
                </button>
                <button
                  type="button"
                  className={styles.actionButton}
                  onClick={() => handleCopy(c.id)}
                  disabled={!drafts[c.id]?.message}
                >
                  {copiedId === c.id ? "복사됨" : "복사"}
                </button>
                <span className={styles.submitWrap}>
                  <button type="button" className={styles.confirmButton} onClick={() => handleConfirm(c)}>
                    발송확인
                  </button>
                  {stampId === c.id && <SealStamp key={`${c.id}-card`} />}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
