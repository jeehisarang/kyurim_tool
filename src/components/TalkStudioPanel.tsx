"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import styles from "@/app/messages/page.module.css";
import SealStamp from "@/components/SealStamp";
import PatientNotes from "@/components/PatientNotes";
import TrialEventCard from "@/components/TrialEventCard";
import TalkGroupManager from "@/components/TalkGroupManager";
import ProgramTeachingCreator from "@/components/ProgramTeachingCreator";
import ShareLinkPanel, {
  buildShareLinkIntro,
  type ShareLinkFlags,
  type ReferralLinkEntry,
} from "@/components/ShareLinkPanel";
import { getCurrentUserId } from "@/lib/currentUser";
import { copyToClipboard } from "@/lib/clipboard";
import {
  FIXED_MESSAGE_TEMPLATE,
  MEETING_TALK_TEMPLATES,
  TALK_MESSAGE_TYPE_LABEL,
  buildExamTalkTemplate,
} from "@/lib/message-templates";

type Patient = { id: number; chartNumber: string; name: string };
type StaffUser = { id: number; name: string; role: string };
type ProgressLevel = "HIGH" | "MID" | "LOW";

const AI_MESSAGE_TYPES = ["DAY2", "DAY7", "THIRD_VISIT"] as const;
type AiMessageType = (typeof AI_MESSAGE_TYPES)[number];
// EXAM(검사톡, task.md) — 웰컴/만남톡처럼 AI 생성이 아니라 위쪽 "링크 포함하기"에서
// 생성한 검사결과 링크를 그대로 카드 내용으로 쓴다.
type MessageType = "WELCOME" | "MEETING" | "EXAM" | AiMessageType;

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
  EXAM: "검사톡",
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

// 검사톡(task.md)은 AI 생성은 아니지만 텍스트박스는 자유 수정 가능해야 한다 — AI 유형과
// 동일하게 drafts(state)로 관리해서 readOnly를 풀고, 복사 시에도 이 값을 그대로 쓴다.
function isEditableMessageType(type: MessageType): boolean {
  return isAiMessageType(type) || type === "EXAM";
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
  // 공유링크 패널(14-11)에서 생성한 URL — 톡 문구 복사 시 하단에 자동으로 함께 복사된다.
  // shareLinkMode는 어떤 안내문구 템플릿을 붙일지 결정한다(task.md).
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareLinkFlags, setShareLinkFlags] = useState<ShareLinkFlags | null>(null);
  // 추천링크 체크박스(task2.md) — 톡 종류 구분 없이 어떤 메시지 타입에도 붙을 수 있다.
  const [referralBlock, setReferralBlock] = useState<string | null>(null);
  // AI가 생성 시점에 링크를 직접 소개하도록 전달할 원자료(task.md 재구조화, 네이버예약
  // 클로징 대체) — referralBlock(고정 문구 블록)과 별개로 kind별 실제 URL이 필요하다.
  const [referralLinksRaw, setReferralLinksRaw] = useState<ReferralLinkEntry[]>([]);

  // "링크 포함하기"에서 실제로 만들어진 링크를 AI 프롬프트용 형태로 변환한다(task.md
  // 재구조화). 티칭/이벤트/검사결과는 shareUrl 하나를 공유하는 조합 링크라 flags별로
  // 같은 URL을 중복 추가하고, 추천링크는 kind별로 URL이 다르므로 그대로 이어붙인다.
  function buildIncludedLinks(): { kind: string; url: string }[] {
    const links: { kind: string; url: string }[] = [];
    if (shareUrl && shareLinkFlags) {
      if (shareLinkFlags.hasTeaching) links.push({ kind: "TEACHING", url: shareUrl });
      if (shareLinkFlags.hasEvent) links.push({ kind: "EVENT", url: shareUrl });
      if (shareLinkFlags.hasExam) links.push({ kind: "EXAM", url: shareUrl });
    }
    for (const l of referralLinksRaw) {
      links.push({ kind: l.kind === "TRIAL" ? "REFERRAL_TRIAL" : "REFERRAL_MAIN", url: l.url });
    }
    return links;
  }

  // 자유톡(범용 AI 문자생성, task.md) — 기존 statuses 배열(발송이력 추적 대상)과 무관한
  // 독립 섹션이라 별도 로컬 상태로 관리한다. MessageLog에 기록되지 않으므로 발송확인/
  // 보류 개념 자체가 없다 — 생성/수정/복사만 지원.
  const [freeformInstruction, setFreeformInstruction] = useState("");
  const [freeformDraft, setFreeformDraft] = useState("");
  const [freeformGenerating, setFreeformGenerating] = useState(false);
  const [freeformError, setFreeformError] = useState<string | null>(null);
  const [freeformCopied, setFreeformCopied] = useState(false);

  function handleLinkGenerated(url: string, flags: ShareLinkFlags) {
    setShareUrl(url);
    setShareLinkFlags(flags);
    // 검사톡(task.md)은 링크 생성 시점에 고정 템플릿을 만들어 drafts에 채워둔다 — 이후
    // 텍스트박스에서 자유롭게 수정할 수 있고, 복사도 이 값(수정본) 기준으로 이뤄진다.
    if (flags.hasExam && selectedPatient) {
      setDrafts((prev) => ({ ...prev, EXAM: buildExamTalkTemplate(selectedPatient.name, url) }));
    }
  }

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
    setShareUrl(null);
    setShareLinkFlags(null);
    setReferralBlock(null);
    setReferralLinksRaw([]);
    setFreeformInstruction("");
    setFreeformDraft("");
    setFreeformError(null);
  }

  function clearSelectedPatient() {
    setSelectedPatient(null);
    setStatuses(null);
    setDrafts({});
    setShareUrl(null);
    setShareLinkFlags(null);
    setReferralBlock(null);
    setReferralLinksRaw([]);
    setFreeformInstruction("");
    setFreeformDraft("");
    setFreeformError(null);
  }

  async function handleGenerateFreeform() {
    if (!selectedPatient || !freeformInstruction.trim()) return;
    setFreeformGenerating(true);
    setFreeformError(null);
    try {
      const res = await fetch("/api/messages/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId: selectedPatient.id,
          messageType: "FREEFORM",
          instruction: freeformInstruction.trim(),
          includedLinks: buildIncludedLinks(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFreeformError(data.error ?? "문구 생성에 실패했습니다.");
        return;
      }
      setFreeformDraft(data.content);
    } catch {
      setFreeformError("서버에 연결하지 못했습니다. 다시 시도해주세요.");
    } finally {
      setFreeformGenerating(false);
    }
  }

  // 링크 포함하기(추천링크/프로그램티칭/이벤트/검사결과) 재사용 — 기존 handleCopy와
  // 동일한 접미사 부착 방식(task.md "기존처럼 동일하게 적용 가능하도록 재사용"). task.md
  // 재구조화 이후엔 생성 시점에 AI가 링크를 이미 본문에 자연스럽게 소개해두므로, 복사 시
  // 접미사 부착은 "생성 후 링크를 새로 체크했는데 재생성을 안 한" 경우의 안전망일 뿐이다 —
  // 그래서 URL이 이미 본문에 있으면 중복으로 또 붙이지 않는다.
  async function handleCopyFreeform() {
    if (!freeformDraft) return;
    let fullText = freeformDraft;
    if (shareUrl && shareLinkFlags && selectedPatient && !fullText.includes(shareUrl)) {
      fullText += `\n\n${buildShareLinkIntro(selectedPatient.name, shareLinkFlags)}\n${shareUrl}`;
    }
    if (referralBlock && !referralLinksRaw.every((l) => fullText.includes(l.url))) {
      fullText += `\n\n${referralBlock}`;
    }
    const success = await copyToClipboard(fullText);
    if (!success) {
      alert("복사에 실패했습니다. 텍스트를 직접 선택해서 복사해주세요.");
      return;
    }
    setFreeformCopied(true);
    setTimeout(() => setFreeformCopied(false), 1500);
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
          includedLinks: buildIncludedLinks(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setGenerateError(data.error ?? "문구 생성에 실패했습니다.");
        return;
      }
      setDrafts((prev) => ({ ...prev, [messageType]: data.content }));
    } catch {
      setGenerateError("서버에 연결하지 못했습니다. 다시 시도해주세요.");
    } finally {
      setGeneratingType(null);
    }
  }

  function contentFor(status: MessageStatus): string {
    if (status.messageType === "WELCOME") return FIXED_MESSAGE_TEMPLATE.WELCOME;
    if (status.messageType === "MEETING") return MEETING_TALK_TEMPLATES[meetingTemplateIndex];
    // 검사톡(task.md) — 위쪽 "링크 포함하기"에서 검사결과를 체크해 링크를 생성하면
    // 고정 템플릿(buildExamTalkTemplate)이 drafts.EXAM에 채워진다(handleLinkGenerated).
    // 그 전까지는 빈 문자열(placeholder로 안내), 이후엔 사용자가 자유롭게 수정 가능.
    return drafts[status.messageType] ?? status.aiDraftContent ?? "";
  }

  async function handleCopy(status: MessageStatus) {
    const text = contentFor(status);
    if (!text) return;
    // EXAM은 contentFor가 이미 링크를 포함한 완성된 문구를 돌려주므로, 다른 유형처럼
    // 링크를 접미사로 또 붙이면 중복된다. 나머지 유형은 생성 시점에 AI가 이미 링크를
    // 본문에 소개해뒀을 수 있어(task.md 재구조화), URL이 이미 본문에 있으면 또 붙이지 않는다.
    let fullText = text;
    if (status.messageType !== "EXAM" && shareUrl && shareLinkFlags && selectedPatient && !fullText.includes(shareUrl)) {
      fullText += `\n\n${buildShareLinkIntro(selectedPatient.name, shareLinkFlags)}\n${shareUrl}`;
    }
    // 추천링크(task2.md)는 EXAM을 포함해 톡 종류 구분 없이 체크된 대로 그대로 붙인다.
    if (referralBlock && !referralLinksRaw.every((l) => fullText.includes(l.url))) {
      fullText += `\n\n${referralBlock}`;
    }
    const success = await copyToClipboard(fullText);
    if (!success) {
      alert("복사에 실패했습니다. 텍스트를 직접 선택해서 복사해주세요.");
      return;
    }
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

    try {
      const res = await fetch("/api/messages/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId: selectedPatient.id,
          messageType: status.messageType,
          staffUserId,
          aiDraftContent: isAiMessageType(status.messageType) ? contentFor(status) : undefined,
        }),
      });
      if (!res.ok) {
        alert("발송확인 처리에 실패했습니다. 다시 시도해주세요.");
        return;
      }
      setStampType(status.messageType);
      refreshStatuses(selectedPatient.id);
    } catch {
      alert("서버에 연결하지 못했습니다. 발송확인 처리되지 않았으니 다시 시도해주세요.");
    }
  }

  async function handleSkip(status: MessageStatus) {
    if (!selectedPatient) return;
    const staffUserId = getCurrentUserId();
    if (!staffUserId) {
      alert("상단에서 현재 사용자를 먼저 선택하세요.");
      return;
    }

    try {
      const res = await fetch("/api/messages/skip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId: selectedPatient.id,
          messageType: status.messageType,
          staffUserId,
        }),
      });
      if (!res.ok) {
        alert("보류 처리에 실패했습니다. 다시 시도해주세요.");
        return;
      }
      setSkippedFeedbackType(status.messageType);
      setTimeout(() => {
        setSkippedFeedbackType((prev) => (prev === status.messageType ? null : prev));
      }, 1500);
      refreshStatuses(selectedPatient.id);
    } catch {
      alert("서버에 연결하지 못했습니다. 보류 처리되지 않았으니 다시 시도해주세요.");
    }
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

        {selectedPatient && <ProgramTeachingCreator patientId={selectedPatient.id} />}
        {selectedPatient && (
          <ShareLinkPanel
            patientId={selectedPatient.id}
            onLinkGenerated={handleLinkGenerated}
            onReferralBlockChange={setReferralBlock}
            onReferralLinksChange={setReferralLinksRaw}
          />
        )}
      </div>

      {selectedPatient && statuses && (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>알림톡 상태</div>

          {generateError && <p className={styles.errorText}>{generateError}</p>}

          <div className={styles.messageList}>
            {/* 웰컴 메시지/만남톡 UI 숨김(task.md) — 실사용 확인 결과 둘 다 미사용
                (웰컴톡은 한차트에서 별도 발송, 만남톡도 미사용 확정). DB/API/발송이력
                로직은 그대로 두고 화면에서만 필터링 — 레거시 데이터 조회는 여전히
                가능해야 하므로(과거 기록 보존 원칙) statuses 자체는 안 건드린다. */}
            {statuses
              .filter((status) => status.messageType !== "WELCOME" && status.messageType !== "MEETING")
              .map((status) => (
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
                  readOnly={!isEditableMessageType(status.messageType)}
                  value={contentFor(status)}
                  onChange={(e) =>
                    isEditableMessageType(status.messageType)
                      ? setDrafts((prev) => ({ ...prev, [status.messageType]: e.target.value }))
                      : undefined
                  }
                  placeholder={
                    isAiMessageType(status.messageType)
                      ? "문구 생성 버튼을 눌러주세요."
                      : status.messageType === "EXAM"
                        ? "위 \"링크 포함하기\"에서 검사결과를 체크하고 링크를 생성하세요."
                        : ""
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

      {/* 자유톡(범용 AI 문자생성, task.md) — 기존 statuses 발송이력 추적과 무관한 독립
          섹션. "링크 포함하기"(위 ShareLinkPanel)는 화면 공용 상태(shareUrl/referralBlock)를
          그대로 공유해서 복사 시 동일하게 붙는다. */}
      {selectedPatient && (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>자유톡</div>
          <p className={styles.muted}>
            생성하고 싶은 메시지의 목적/내용을 입력하면, 선택된 환자의 메모/이력을 참고해
            AI가 맞춤 문구를 만들어드립니다.
          </p>

          <div className={styles.messageCard}>
            <div className={styles.generationOptions}>
              <input
                type="text"
                className={styles.keywordInput}
                placeholder='예: "다음주 명절 인사 문자 써줘"'
                value={freeformInstruction}
                onChange={(e) => setFreeformInstruction(e.target.value)}
              />
            </div>

            {freeformError && <p className={styles.errorText}>{freeformError}</p>}

            <textarea
              className={styles.messageTextarea}
              value={freeformDraft}
              onChange={(e) => setFreeformDraft(e.target.value)}
              placeholder="목적/내용을 입력하고 생성 버튼을 눌러주세요."
              rows={3}
            />

            <div className={styles.messageActions}>
              <button
                type="button"
                className={styles.actionButton}
                onClick={handleGenerateFreeform}
                disabled={freeformGenerating || !freeformInstruction.trim()}
              >
                {freeformGenerating ? "생성 중..." : "문구 생성"}
              </button>
              <button
                type="button"
                className={styles.actionButton}
                onClick={handleCopyFreeform}
                disabled={!freeformDraft}
              >
                {freeformCopied ? "복사됨" : "복사"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
