"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./ShareLinkPanel.module.css";
import ProgramTeachingCreator from "@/components/ProgramTeachingCreator";
import { getCurrentUserId } from "@/lib/currentUser";
import { copyToClipboard } from "@/lib/clipboard";
import { EXAM_TYPE_LABEL, weightCell, gripLabel, hrvSummaryLabel, formatExamDate, type ExaminationRow } from "@/lib/examination-format";
import { buildReferralShareBlock, REFERRAL_SHARE_LABEL, type ReferralLinkKind } from "@/lib/referral-share-format";

// 링크에 포함된 3개 축(티칭/이벤트/검사결과, task.md) — 서로 독립적으로 0개 이상 조합 가능.
// 복사 시 어떤 안내문구를 붙일지 결정하는 데 쓰인다.
export type ShareLinkFlags = { hasTeaching: boolean; hasEvent: boolean; hasExam: boolean };

function comboKey(f: ShareLinkFlags): string {
  return `${f.hasTeaching ? "T" : ""}${f.hasEvent ? "E" : ""}${f.hasExam ? "X" : ""}`;
}

// 링크 자동첨부 시 앞에 붙는 고정 안내문구(task.md) — AI 호출 없이 환자 이름만 치환.
// 조합별로 자연스러운 한국어 조사를 그대로 고정 문구로 써서(동적 조립 시 조사 오류 위험 방지)
// ShareLinkPanel을 쓰는 화면(TalkStudioPanel/TalkGroupManager)이 공통으로 재사용한다.
// 검사(EXAM)가 포함된 조합은 아래 EXAM_INTRO를 항상 맨 앞에 고정 배치하고(task.md "검사링크
// 복사 시 개인화 안내문구 자동첨부"), 티칭/이벤트 조합 문구는 검사 없는 버전(T/E/TE)만 남겨
// 그 뒤에 이어 붙인다 — 그래서 이 테이블에는 검사 미포함 조합(T/E/TE)만 존재한다.
const INTRO_BY_COMBO: Record<string, (patientName: string) => string> = {
  T: (name) => `${name}님의 검사 결과와 추천 프로그램을 아래 링크에서 확인해보세요 🙂`,
  E: (name) => `${name}님을 위한 특별한 혜택을 아래 링크에서 확인해보세요 🙂`,
  TE: (name) => `${name}님의 검사 결과와 추천 혜택을 아래 링크에서 확인해보세요 🙂`,
};

const EXAM_INTRO = (patientName: string) => `${patientName}님 검사결과를 클릭해서 확인해보세요.`;

export function buildShareLinkIntro(patientName: string, flags: ShareLinkFlags): string {
  if (flags.hasExam) {
    // 검사 포함 시엔 항상 개인화 문구가 맨 앞(task.md 요구사항 2) — 티칭/이벤트가 함께
    // 선택돼 있으면 그 조합 문구(검사 제외 버전)를 다음 줄에 이어 붙인다. URL은 이 함수가
    // 반환하지 않고 호출부가 마지막에 한 번만 붙인다(중복 방지).
    const nonExamCombo = comboKey({ ...flags, hasExam: false });
    const secondary = nonExamCombo ? INTRO_BY_COMBO[nonExamCombo]?.(patientName) : null;
    return secondary ? `${EXAM_INTRO(patientName)}\n${secondary}` : EXAM_INTRO(patientName);
  }
  const combo = INTRO_BY_COMBO[comboKey(flags)];
  return combo ? combo(patientName) : `${patientName}님, 아래 링크를 확인해보세요 🙂`;
}

type TeachingSummary = { id: number; token: string; programName: string; createdAt: string };
type EventSummary = { id: number; finalTitle: string };
type ActiveReferralLinkView = { kind: ReferralLinkKind; token: string; expiresAt: string };

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
  onReferralBlockChange,
  defaultCheckTrialReferral,
}: {
  patientId: number;
  onLinkGenerated: (url: string, flags: ShareLinkFlags) => void;
  // 추천링크 체크박스(task2.md) — 다른 3개(티칭/이벤트/검사)와 달리 "링크 생성" 버튼 없이
  // 체크 즉시 고정 문구 블록을 부모에 알려준다(이미 발급된 링크를 재사용할 뿐 새로 만들
  // 게 없어서). 옵션이라 안 넘기면 체크박스는 뜨되 부모에 알릴 방법이 없을 뿐 동작엔 문제없다.
  onReferralBlockChange?: (block: string | null) => void;
  // 2일차톡 생성 컨텍스트(TalkGroupManager)에서만 true로 넘어온다 — 기존에 자동삽입되던
  // TRIAL 추천링크를 이 체크박스가 대체하면서 기본 체크 상태로 시작시키기 위함.
  defaultCheckTrialReferral?: boolean;
}) {
  const [includeTeaching, setIncludeTeaching] = useState(false);
  const [includeEvent, setIncludeEvent] = useState(false);
  const [includeExam, setIncludeExam] = useState(false);

  const [referralLinks, setReferralLinks] = useState<ActiveReferralLinkView[] | null>(null);
  const [checkedReferralKinds, setCheckedReferralKinds] = useState<Set<ReferralLinkKind>>(new Set());
  const appliedDefaultReferralRef = useRef(false);

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

  // 추천링크는 티칭/이벤트/검사와 달리 체크박스 노출 여부 자체를 데이터로 결정해야 해서
  // (활성 링크가 없으면 체크박스를 아예 숨김, task2.md) 체크 여부와 무관하게 처음부터 조회한다.
  useEffect(() => {
    fetch(`/api/patients/${patientId}/referral-links`)
      .then((res) => res.json())
      .then(setReferralLinks)
      .catch(() => setReferralLinks([]));
  }, [patientId]);

  // 2일차톡 컨텍스트면 TRIAL 링크를 기본 체크(task2.md, 기존 자동삽입 대체) — 데이터 로드
  // 시점에 딱 한 번만 적용하고, 이후 사용자가 직접 껐다 켜는 것은 건드리지 않는다.
  useEffect(() => {
    if (appliedDefaultReferralRef.current) return;
    if (referralLinks === null) return;
    if (defaultCheckTrialReferral && referralLinks.some((l) => l.kind === "TRIAL")) {
      setCheckedReferralKinds((prev) => new Set(prev).add("TRIAL"));
    }
    appliedDefaultReferralRef.current = true;
  }, [referralLinks, defaultCheckTrialReferral]);

  // 다른 3개(티칭/이벤트/검사)와 달리 "링크 생성" 버튼 없이 체크 즉시 부모에 알린다 — 이미
  // 발급된 링크를 그대로 재사용할 뿐이라 새로 만들 게 없다.
  useEffect(() => {
    if (!onReferralBlockChange) return;
    if (!referralLinks || checkedReferralKinds.size === 0) {
      onReferralBlockChange(null);
      return;
    }
    const blocks = referralLinks
      .filter((l) => checkedReferralKinds.has(l.kind))
      .map((l) => buildReferralShareBlock(l.kind, l.token, new Date(l.expiresAt)));
    onReferralBlockChange(blocks.length > 0 ? blocks.join("\n\n") : null);
  }, [checkedReferralKinds, referralLinks, onReferralBlockChange]);

  function toggleReferralKind(kind: ReferralLinkKind) {
    setCheckedReferralKinds((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
  }

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
        {referralLinks?.map((link) => (
          <label key={link.kind} className={styles.modeOption}>
            <input
              type="checkbox"
              checked={checkedReferralKinds.has(link.kind)}
              onChange={() => toggleReferralKind(link.kind)}
            />
            {REFERRAL_SHARE_LABEL[link.kind]}
          </label>
        ))}
      </div>

      {/* 실제 공개페이지(/s/[token]) 표시 순서(검사결과→티칭→이벤트, task.md)와 맞춰
          미리보기 성격의 상세 UI도 같은 순서로 배치한다 — 위 체크박스 3개의 배치 자체는
          그대로 두고, 그 아래 상세 입력/체크리스트 블록 순서만 바꿨다. */}
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
