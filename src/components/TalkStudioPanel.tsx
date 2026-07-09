"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import styles from "@/app/messages/page.module.css";
import SealStamp from "@/components/SealStamp";
import PatientNotes from "@/components/PatientNotes";
import TrialEventCard from "@/components/TrialEventCard";
import TalkGroupManager from "@/components/TalkGroupManager";
import { getCurrentUserId } from "@/lib/currentUser";
import {
  FIXED_MESSAGE_TEMPLATE,
  MEETING_TALK_TEMPLATES,
  TALK_MESSAGE_TYPE_LABEL,
} from "@/lib/message-templates";

type Patient = { id: number; chartNumber: string; name: string };
type StaffUser = { id: number; name: string; role: string };
type ProgressLevel = "HIGH" | "MID" | "LOW";

const AI_MESSAGE_TYPES = ["DAY2", "DAY7", "THIRD_VISIT"] as const;
type AiMessageType = (typeof AI_MESSAGE_TYPES)[number];
type MessageType = "WELCOME" | "MEETING" | AiMessageType;

// 2일톡/3회차톡도 자동조건 도달 전에 수동으로 즉시 보류할 수 있어야 한다 — 기존에는
// 7일톡만 가능했음(task2.md 확인/수정 요청).
const SKIPPABLE_MESSAGE_TYPES: MessageType[] = ["DAY2", "DAY7", "THIRD_VISIT"];

const PROGRESS_LEVEL_LABEL: Record<ProgressLevel, string> = {
  HIGH: "상 (60%↑)",
  MID: "중 (30~50%)",
  LOW: "하 (0~30%)",
};

const MESSAGE_TYPE_LABEL: Record<MessageType, string> = {
  WELCOME: "웰컴 메시지",
  MEETING: "만남톡",
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

/**
 * "톡 생성" 탭(/ai-studio) 콘텐츠 — 이전 /messages 페이지의 전체 기능을 그대로 옮겨온 것.
 * /messages는 이제 이 화면으로 리다이렉트만 하는 얇은 shim이다(하위호환용).
 */
export default function TalkStudioPanel() {
  return (
    <Suspense fallback={null}>
      <TalkStudioRouter />
    </Suspense>
  );
}

/**
 * /todo의 "톡 관리"에서 넘어온 경우 patientId+date(talkGroup=1)가 실려온다 — 이 경우
 * 내원기반/프로그램기반 톡 후보를 우선순위 없이 모두 모은 체크리스트(TalkGroupManager)로
 * 라우팅한다. 기존 patientId 기반 5종 톡 목록 흐름(TalkStudioInner, 사이드바에서 진입)과는
 * 완전히 분리되어 있다.
 * todoTaskId 단독 라우팅(TrialEventCard)은 이전 버전과의 직접 링크 호환을 위해 남겨둔다.
 */
function TalkStudioRouter() {
  const searchParams = useSearchParams();
  const todoTaskId = searchParams.get("todoTaskId");
  const talkGroupPatientId = searchParams.get("talkGroup") === "1" ? searchParams.get("patientId") : null;
  const talkGroupDate = searchParams.get("date");

  if (talkGroupPatientId && talkGroupDate) {
    return (
      <div className={styles.section}>
        <div className={styles.sectionTitle}>환자별 톡 관리</div>
        <TalkGroupManager patientId={Number(talkGroupPatientId)} date={talkGroupDate} />
      </div>
    );
  }

  if (todoTaskId) {
    return (
      <div className={styles.section}>
        <div className={styles.sectionTitle}>프로그램 이벤트</div>
        <TrialEventCard todoTaskId={Number(todoTaskId)} />
      </div>
    );
  }

  return <TalkStudioInner />;
}

function TalkStudioInner() {
  const searchParams = useSearchParams();

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
  const [copiedType, setCopiedType] = useState<MessageType | null>(null);
  const [skippedFeedbackType, setSkippedFeedbackType] = useState<MessageType | null>(null);
  const [meetingTemplateIndex, setMeetingTemplateIndex] = useState<0 | 1>(0);

  // "오늘 할 일"의 "톡생성 하기" 버튼에서 넘어온 경우: 환자 + 톡 유형을 미리 선택된 상태로 만든다.
  const preselectMessageType = searchParams.get("messageType");
  const highlightType: MessageType | null =
    preselectMessageType && isAiMessageType(preselectMessageType as MessageType)
      ? (preselectMessageType as MessageType)
      : null;

  useEffect(() => {
    const patientId = searchParams.get("patientId");
    const chartNumber = searchParams.get("chartNumber");
    const name = searchParams.get("name");
    if (patientId && chartNumber && name) {
      selectPatient({ id: Number(patientId), chartNumber, name });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    if (status.messageType === "WELCOME") return FIXED_MESSAGE_TEMPLATE.WELCOME;
    if (status.messageType === "MEETING") return MEETING_TALK_TEMPLATES[meetingTemplateIndex];
    return drafts[status.messageType] ?? status.aiDraftContent ?? "";
  }

  async function handleCopy(status: MessageStatus) {
    const text = contentFor(status);
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setCopiedType(status.messageType);
    setTimeout(() => {
      setCopiedType((prev) => (prev === status.messageType ? null : prev));
    }, 1500);
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

    setSkippedFeedbackType(status.messageType);
    setTimeout(() => {
      setSkippedFeedbackType((prev) => (prev === status.messageType ? null : prev));
    }, 1500);
    refreshStatuses(selectedPatient.id);
  }

  return (
    <>
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
              <div
                key={status.messageType}
                className={
                  highlightType === status.messageType
                    ? `${styles.messageCard} ${styles.messageCardHighlight}`
                    : styles.messageCard
                }
              >
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

                {status.messageType === "MEETING" && (
                  <div className={styles.generationOptions}>
                    <select
                      className={styles.progressSelect}
                      value={meetingTemplateIndex}
                      onChange={(e) =>
                        setMeetingTemplateIndex(Number(e.target.value) as 0 | 1)
                      }
                    >
                      <option value={0}>템플릿 1</option>
                      <option value={1}>템플릿 2</option>
                    </select>
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
                    {copiedType === status.messageType ? "복사됨" : "복사"}
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
                      {skippedFeedbackType === status.messageType ? "보류함" : "보류"}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
