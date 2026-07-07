"use client";

import { useEffect, useState } from "react";
import styles from "./page.module.css";
import SealStamp from "@/components/SealStamp";
import PatientNotes from "@/components/PatientNotes";
import { getCurrentUserId } from "@/lib/currentUser";
import { FIXED_MESSAGE_TEMPLATE, TALK_MESSAGE_TYPE_LABEL } from "@/lib/message-templates";

type Patient = { id: number; chartNumber: string; name: string };
type StaffUser = { id: number; name: string; role: string };
type ProgressLevel = "HIGH" | "MID" | "LOW";

const AI_MESSAGE_TYPES = ["DAY2", "DAY7", "THIRD_VISIT"] as const;
type AiMessageType = (typeof AI_MESSAGE_TYPES)[number];
type MessageType = "WELCOME" | "MEETING" | AiMessageType;

const SKIPPABLE_MESSAGE_TYPES: MessageType[] = ["DAY7"];

const PROGRESS_LEVEL_LABEL: Record<ProgressLevel, string> = {
  HIGH: "상 (60%↑)",
  MID: "중 (30~50%)",
  LOW: "하 (0~30%)",
};

const MESSAGE_TYPE_LABEL: Record<MessageType, string> = {
  WELCOME: "웰컴 메시지",
  MEETING: "상담예정 안내",
  ...TALK_MESSAGE_TYPE_LABEL,
};

type MessageStatus = {
  messageType: MessageType;
  sentDate: string | null;
  staffUser: StaffUser | null;
  skippedAt: string | null;
  skippedByUser: StaffUser | null;
  aiDraftContent: string | null;
};

function isAiMessageType(type: MessageType): type is AiMessageType {
  return (AI_MESSAGE_TYPES as readonly string[]).includes(type);
}

export default function MessagesPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Patient[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);

  const [statuses, setStatuses] = useState<MessageStatus[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [extraKeywords, setExtraKeywords] = useState<Record<string, string>>({});
  const [progressLevels, setProgressLevels] = useState<Record<string, ProgressLevel>>({
    THIRD_VISIT: "MID",
  });
  const [generatingType, setGeneratingType] = useState<MessageType | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [stampType, setStampType] = useState<MessageType | null>(null);

  useEffect(() => {
    if (!selectedPatient) return;
    refreshStatuses(selectedPatient.id);
  }, [selectedPatient]);

  function refreshStatuses(patientId: number) {
    fetch(`/api/messages?patientId=${patientId}`)
      .then((res) => res.json())
      .then(setStatuses);
  }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    try {
      const res = await fetch(`/api/patients?q=${encodeURIComponent(query.trim())}`);
      const data: Patient[] = await res.json();
      setResults(data);
    } finally {
      setSearching(false);
    }
  }

  function selectPatient(patient: Patient) {
    setSelectedPatient(patient);
    setResults(null);
    setQuery("");
    setDrafts({});
    setGenerateError(null);
  }

  function clearSelectedPatient() {
    setSelectedPatient(null);
    setStatuses(null);
    setDrafts({});
  }

  async function handleGenerate(messageType: AiMessageType) {
    if (!selectedPatient) return;
    setGeneratingType(messageType);
    setGenerateError(null);
    try {
      const res = await fetch("/api/messages/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId: selectedPatient.id,
          messageType,
          extraKeywords: extraKeywords[messageType] || undefined,
          progressLevel: messageType === "THIRD_VISIT" ? progressLevels.THIRD_VISIT : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setGenerateError(data.error ?? "문구 생성에 실패했습니다.");
        return;
      }
      setDrafts((prev) => ({ ...prev, [messageType]: data.content }));
    } finally {
      setGeneratingType(null);
    }
  }

  function contentFor(status: MessageStatus): string {
    if (!isAiMessageType(status.messageType)) {
      return FIXED_MESSAGE_TEMPLATE[status.messageType as "WELCOME" | "MEETING"];
    }
    return drafts[status.messageType] ?? status.aiDraftContent ?? "";
  }

  async function handleCopy(status: MessageStatus) {
    const text = contentFor(status);
    if (!text) return;
    await navigator.clipboard.writeText(text);
  }

  async function handleConfirm(status: MessageStatus) {
    if (!selectedPatient) return;
    const staffUserId = getCurrentUserId();
    if (!staffUserId) {
      alert("상단에서 현재 사용자를 먼저 선택하세요.");
      return;
    }

    await fetch("/api/messages/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        patientId: selectedPatient.id,
        messageType: status.messageType,
        staffUserId,
        aiDraftContent: isAiMessageType(status.messageType) ? contentFor(status) : undefined,
      }),
    });

    setStampType(status.messageType);
    refreshStatuses(selectedPatient.id);
  }

  async function handleSkip(status: MessageStatus) {
    if (!selectedPatient) return;
    const staffUserId = getCurrentUserId();
    if (!staffUserId) {
      alert("상단에서 현재 사용자를 먼저 선택하세요.");
      return;
    }

    await fetch("/api/messages/skip", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        patientId: selectedPatient.id,
        messageType: status.messageType,
        staffUserId,
      }),
    });

    refreshStatuses(selectedPatient.id);
  }

  return (
    <div className={styles.container}>
      <h1 className={styles.pageTitle}>문자발송 관리</h1>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>환자 검색</div>

        {!selectedPatient && (
          <>
            <form className={styles.row} onSubmit={handleSearch}>
              <input
                type="text"
                placeholder="차트번호 또는 이름"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <button type="submit" disabled={searching}>
                검색
              </button>
            </form>

            {results !== null && results.length > 0 && (
              <ul className={styles.resultList}>
                {results.map((p) => (
                  <li key={p.id} onClick={() => selectPatient(p)}>
                    {p.name} (<span className={styles.mono}>{p.chartNumber}</span>)
                  </li>
                ))}
              </ul>
            )}

            {results !== null && results.length === 0 && (
              <p className={styles.muted}>검색 결과가 없습니다.</p>
            )}
          </>
        )}

        {selectedPatient && (
          <div className={styles.selectedPatient}>
            <span>
              선택된 환자: <strong>{selectedPatient.name}</strong> (
              <span className={styles.mono}>{selectedPatient.chartNumber}</span>)
            </span>
            <button type="button" onClick={clearSelectedPatient}>
              다른 환자 선택
            </button>
          </div>
        )}
      </div>

      {selectedPatient && statuses && (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>알림톡 상태</div>

          {generateError && <p className={styles.errorText}>{generateError}</p>}

          <div className={styles.messageList}>
            {statuses.map((status) => (
              <div key={status.messageType} className={styles.messageCard}>
                <div className={styles.messageHeader}>
                  <span className={styles.messageTypeLabel}>
                    {MESSAGE_TYPE_LABEL[status.messageType]}
                  </span>
                  <span
                    className={
                      status.sentDate
                        ? styles.sentBadge
                        : status.skippedAt
                          ? styles.skippedBadge
                          : styles.unsentBadge
                    }
                  >
                    {status.sentDate
                      ? `발송함 (${status.staffUser?.name ?? "-"})`
                      : status.skippedAt
                        ? `보류됨 (${status.skippedByUser?.name ?? "-"})`
                        : "발송안함"}
                  </span>
                </div>

                {isAiMessageType(status.messageType) && (
                  <div className={styles.notesBlock}>
                    <PatientNotes patientId={selectedPatient.id} />
                  </div>
                )}

                {isAiMessageType(status.messageType) && (
                  <div className={styles.generationOptions}>
                    <input
                      type="text"
                      className={styles.keywordInput}
                      placeholder="이번 발송에만 참고할 추가 키워드 (선택)"
                      value={extraKeywords[status.messageType] ?? ""}
                      onChange={(e) =>
                        setExtraKeywords((prev) => ({
                          ...prev,
                          [status.messageType]: e.target.value,
                        }))
                      }
                    />
                    {status.messageType === "THIRD_VISIT" && (
                      <select
                        className={styles.progressSelect}
                        value={progressLevels.THIRD_VISIT}
                        onChange={(e) =>
                          setProgressLevels((prev) => ({
                            ...prev,
                            THIRD_VISIT: e.target.value as ProgressLevel,
                          }))
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
                  readOnly={!isAiMessageType(status.messageType)}
                  value={contentFor(status)}
                  onChange={(e) =>
                    isAiMessageType(status.messageType)
                      ? setDrafts((prev) => ({ ...prev, [status.messageType]: e.target.value }))
                      : undefined
                  }
                  placeholder={
                    isAiMessageType(status.messageType) ? "문구 생성 버튼을 눌러주세요." : ""
                  }
                  rows={3}
                />

                <div className={styles.messageActions}>
                  {isAiMessageType(status.messageType) && (
                    <button
                      type="button"
                      className={styles.actionButton}
                      onClick={() => handleGenerate(status.messageType as AiMessageType)}
                      disabled={generatingType === status.messageType}
                    >
                      {generatingType === status.messageType ? "생성 중..." : "문구 생성"}
                    </button>
                  )}
                  <button
                    type="button"
                    className={styles.actionButton}
                    onClick={() => handleCopy(status)}
                    disabled={!contentFor(status)}
                  >
                    복사
                  </button>
                  <span className={styles.submitWrap}>
                    <button
                      type="button"
                      className={styles.confirmButton}
                      onClick={() => handleConfirm(status)}
                    >
                      발송확인
                    </button>
                    {stampType === status.messageType && (
                      <SealStamp key={`${status.messageType}-${stampType}`} />
                    )}
                  </span>
                  {SKIPPABLE_MESSAGE_TYPES.includes(status.messageType) && !status.sentDate && (
                    <button
                      type="button"
                      className={styles.skipButton}
                      onClick={() => handleSkip(status)}
                    >
                      보류
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
