"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import styles from "./page.module.css";
import BackButton from "@/components/BackButton";
import ProgramBadge from "@/components/ProgramBadge";
import { copyToClipboard } from "@/lib/clipboard";
import { useCurrentUserContext } from "@/lib/CurrentUserContext";
import { getProgramBadgeInfo } from "@/lib/program-categories";

type MissionTemplate = {
  id: number;
  type: string;
  category: string;
  title: string;
  body: string;
  rewardAmount: number;
};

type Submission = {
  id: number;
  patientId: number;
  token: string;
  status: string;
  patient: { id: number; name: string; chartNumber: string };
};

type Assignment = {
  id: number;
  date: string;
  missionTemplate: MissionTemplate;
  introPhrase: { id: number; text: string } | null;
  submissions: Submission[];
};

type KillCapPatient = {
  patientId: number;
  patientName: string;
  chartNumber: string;
  programId: number;
  programName: string;
};

type GeneratedMessage = {
  patientId: number;
  patientName: string;
  message: string;
  token: string;
  missionTemplateId: number;
};

// 발송이력 요약(task.md 발송관리 개선) — "발송 N회 · 최근 MM/DD 담당자".
type SendLogSummary = { count: number; lastSentAt: string; lastSentByStaffName: string };

type TodaySendLog = { sentAt: string; staffName: string };

type RangeStats = {
  rangeStart: string;
  rangeEnd: string;
  sentCount: number;
  completedCount: number;
  completionRate: number;
};

const TYPE_LABEL: Record<string, string> = { QUIZ: "퀴즈", PHOTO: "사진", TEXT: "텍스트" };
const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

function todayParam(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ISO 문자열 → <input type="date"> 값(YYYY-MM-DD).
function toDateInputValue(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatMonthDay(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return `${formatMonthDay(iso)} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function formatRangeLabel(startIso: string, endIso: string): string {
  const fmt = (iso: string) => {
    const d = new Date(iso);
    return `${d.getMonth() + 1}/${d.getDate()}(${WEEKDAY_LABELS[d.getDay()]})`;
  };
  return `${fmt(startIso)} ~ ${fmt(endIso)}`;
}

/**
 * 오늘의 미션 발송(/missions/today, task.md 3-3 + task2.md 문구 생성) — 상단: 오늘 지정된
 * 미션 미리보기(없으면 뱅크에서 선택). 하단: 킬팻캡슐 진행중 환자 리스트 + 환자별 "문구
 * 생성"(서두문구+미션요약+제출링크 조합, 생성 자체가 발송 준비 완료 처리를 겸함).
 */
export default function MissionsTodayPage() {
  const { currentUser } = useCurrentUserContext();
  const [assignment, setAssignment] = useState<Assignment | null | undefined>(undefined);
  const [killCapPatients, setKillCapPatients] = useState<KillCapPatient[]>([]);
  const [activeTemplates, setActiveTemplates] = useState<MissionTemplate[]>([]);
  const [pickerTemplateId, setPickerTemplateId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatingPatientId, setGeneratingPatientId] = useState<number | null>(null);
  const [generatedMessage, setGeneratedMessage] = useState<GeneratedMessage | null>(null);
  const [copied, setCopied] = useState(false);
  // 중복발송 경고(task.md) — 현재 생성된 문구의 환자가 당일 이미 발송(복사)한 이력.
  const [todaySendLog, setTodaySendLog] = useState<TodaySendLog | null>(null);

  // 발송이력 요약 + 프로그램 뱃지/필터/검색(task.md 발송관리 개선).
  const [sendLogSummaries, setSendLogSummaries] = useState<Record<number, SendLogSummary>>({});
  const [programFilter, setProgramFilter] = useState<number | "ALL">("ALL");
  const [patientSearchQuery, setPatientSearchQuery] = useState("");

  // 발송/수행 통계 요약카드(task2.md) — 진입 시 항상 이번주(월~일)로 초기화.
  const [rangeStats, setRangeStats] = useState<RangeStats | null>(null);
  const [rangeStartInput, setRangeStartInput] = useState("");
  const [rangeEndInput, setRangeEndInput] = useState("");

  function loadStats(start?: string, end?: string) {
    const query = start && end ? `?start=${start}&end=${end}` : "";
    fetch(`/api/missions/stats${query}`)
      .then((res) => res.json())
      .then((data: RangeStats) => {
        setRangeStats(data);
        setRangeStartInput(toDateInputValue(data.rangeStart));
        setRangeEndInput(toDateInputValue(data.rangeEnd));
      });
  }

  function handleRangeSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!rangeStartInput || !rangeEndInput) return;
    loadStats(rangeStartInput, rangeEndInput);
  }

  useEffect(() => {
    loadStats();
  }, []);

  function load() {
    fetch(`/api/missions/today?date=${todayParam()}`)
      .then((res) => res.json())
      .then((data) => {
        setAssignment(data.assignment);
        setKillCapPatients(data.killCapPatients);
        setActiveTemplates(data.activeTemplates);
        setSendLogSummaries(data.sendLogSummaries ?? {});
      });
  }

  useEffect(() => {
    load();
  }, []);

  async function handlePickMission(e: React.FormEvent) {
    e.preventDefault();
    if (!currentUser || !pickerTemplateId) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/missions/today", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          staffUserId: currentUser.id,
          date: todayParam(),
          missionTemplateId: Number(pickerTemplateId),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "미션 지정에 실패했습니다.");
        return;
      }
      load();
    } catch {
      setError("서버에 연결하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  async function handleGenerateMessage(patientId: number, patientName: string) {
    setGeneratingPatientId(patientId);
    setCopied(false);
    setTodaySendLog(null);
    try {
      const res = await fetch(`/api/missions/today/message/${patientId}`);
      const data = await res.json();
      if (!res.ok) {
        alert(data.error ?? "문구 생성에 실패했습니다.");
        return;
      }
      setGeneratedMessage({
        patientId,
        patientName,
        message: data.message,
        token: data.token,
        missionTemplateId: data.missionTemplateId,
      });
      setTodaySendLog(data.todaySendLog ?? null);
      load();
    } catch {
      alert("서버에 연결하지 못했습니다.");
    } finally {
      setGeneratingPatientId(null);
    }
  }

  // "복사" 버튼 클릭 시점 = 실제 발송 직전 행동으로 간주해 이 시점에 발송이력을 남긴다
  // (task.md — "문구 생성" 시점이 아니라 "복사" 시점에 기록).
  async function handleCopyMessage() {
    if (!generatedMessage || !currentUser) return;
    const success = await copyToClipboard(generatedMessage.message);
    if (!success) {
      alert("복사에 실패했습니다. 직접 선택해서 복사해주세요.");
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
    try {
      await fetch("/api/missions/today/send-log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId: generatedMessage.patientId,
          missionTemplateId: generatedMessage.missionTemplateId,
          staffUserId: currentUser.id,
        }),
      });
      load();
    } catch {
      // 발송이력 기록 실패는 복사 자체(이미 완료됨)를 막지 않는다 — 조용히 무시.
    }
  }

  const submissionByPatientId = new Map((assignment?.submissions ?? []).map((s) => [s.patientId, s]));

  // 프로그램별 필터(task.md 발송관리 개선) — /prescriptions 세부 필터와 동일하게 tier
  // (짧은 기간 → 긴 기간) 순으로 정렬한다.
  const programOptions = useMemo(() => {
    const byProgramId = new Map<number, string>();
    for (const p of killCapPatients) byProgramId.set(p.programId, p.programName);
    return [...byProgramId.entries()]
      .map(([programId, programName]) => ({ programId, programName }))
      .sort((a, b) => {
        const tierA = getProgramBadgeInfo(a.programName)?.tier ?? 99;
        const tierB = getProgramBadgeInfo(b.programName)?.tier ?? 99;
        return tierA - tierB;
      });
  }, [killCapPatients]);

  const filteredPatients = useMemo(() => {
    const q = patientSearchQuery.trim();
    return killCapPatients.filter((p) => {
      if (programFilter !== "ALL" && p.programId !== programFilter) return false;
      if (q && !p.patientName.includes(q) && !p.chartNumber.includes(q)) return false;
      return true;
    });
  }, [killCapPatients, programFilter, patientSearchQuery]);

  return (
    <div className={styles.container}>
      <div className={styles.titleRow}>
        <BackButton />
        <h1 className={styles.pageTitle}>오늘의 미션 발송</h1>
      </div>
      <p className={styles.muted}>킬팻캡슐 진행중 환자 대상 — 카톡 발송은 직접, 문구는 여기서 생성.</p>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>발송/수행 현황</div>
        {rangeStats === null ? (
          <p className={styles.muted}>불러오는 중...</p>
        ) : (
          <>
            <div className={styles.statsRow}>
              <div className={styles.statItem}>
                <span className={styles.statLabel}>발송</span>
                <span className={styles.statValue}>{rangeStats.sentCount}명</span>
              </div>
              <div className={styles.statItem}>
                <span className={styles.statLabel}>수행</span>
                <span className={styles.statValue}>{rangeStats.completedCount}명</span>
              </div>
              <div className={styles.statItem}>
                <span className={styles.statLabel}>수행율</span>
                <span className={styles.statValue}>{rangeStats.completionRate}%</span>
              </div>
            </div>
            <p className={styles.muted} style={{ marginBottom: 10 }}>
              {formatRangeLabel(rangeStats.rangeStart, rangeStats.rangeEnd)}
            </p>
            <form className={styles.rangeForm} onSubmit={handleRangeSearch}>
              <input
                type="date"
                value={rangeStartInput}
                onChange={(e) => setRangeStartInput(e.target.value)}
              />
              <span>~</span>
              <input type="date" value={rangeEndInput} onChange={(e) => setRangeEndInput(e.target.value)} />
              <button type="submit" className={styles.smallButton}>
                조회
              </button>
            </form>
          </>
        )}
      </div>

      <div className={styles.section}>
        <Link href="/missions/approvals" className={styles.smallButton}>
          승인 대기 큐 →
        </Link>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>오늘의 미션</div>
        {assignment === undefined ? (
          <p className={styles.muted}>불러오는 중...</p>
        ) : assignment ? (
          <>
            {assignment.introPhrase && (
              <div className={styles.introPhraseBox}>💬 {assignment.introPhrase.text}</div>
            )}
            <div className={styles.missionPreview}>
              <div className={styles.missionPreviewTitle}>
                [{TYPE_LABEL[assignment.missionTemplate.type] ?? assignment.missionTemplate.type}]{" "}
                {assignment.missionTemplate.title}
              </div>
              <div className={styles.missionPreviewBody}>{assignment.missionTemplate.body}</div>
            </div>
            <button
              type="button"
              className={styles.smallButton}
              onClick={() => setAssignment(null)}
            >
              다른 미션으로 변경
            </button>
          </>
        ) : (
          <form onSubmit={handlePickMission}>
            <select
              className={styles.select}
              value={pickerTemplateId}
              onChange={(e) => setPickerTemplateId(e.target.value)}
            >
              <option value="">미션을 선택하세요</option>
              {activeTemplates.map((t) => (
                <option key={t.id} value={t.id}>
                  [{TYPE_LABEL[t.type] ?? t.type}] {t.title}
                </option>
              ))}
            </select>
            {error && <p className={styles.errorText}>{error}</p>}
            <button type="submit" className={styles.primaryButton} disabled={!pickerTemplateId || saving}>
              {saving ? "지정 중..." : "오늘의 미션으로 지정"}
            </button>
          </form>
        )}
      </div>

      {generatedMessage && (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>{generatedMessage.patientName}님 발송문구</div>
          {todaySendLog && (
            <p className={styles.warningBanner}>
              ⚠️ 오늘 {todaySendLog.staffName}님이 이미 발송했습니다 ({formatDateTime(todaySendLog.sentAt)})
            </p>
          )}
          <div className={styles.missionPreview}>
            <div className={styles.missionPreviewBody} style={{ whiteSpace: "pre-wrap" }}>
              {generatedMessage.message}
            </div>
          </div>
          <button type="button" className={styles.primaryButton} onClick={handleCopyMessage}>
            {copied ? "복사됨!" : "복사"}
          </button>
        </div>
      )}

      <div className={styles.section}>
        <div className={styles.sectionTitle}>킬팻캡슐 진행중 환자 ({filteredPatients.length}/{killCapPatients.length}명)</div>
        <input
          type="text"
          className={styles.select}
          placeholder="차트번호 또는 이름으로 검색"
          value={patientSearchQuery}
          onChange={(e) => setPatientSearchQuery(e.target.value)}
        />
        <div className={styles.filterTabs}>
          <button
            type="button"
            className={programFilter === "ALL" ? `${styles.filterTab} ${styles.filterTabActive}` : styles.filterTab}
            onClick={() => setProgramFilter("ALL")}
          >
            전체
          </button>
          {programOptions.map((opt) => (
            <button
              key={opt.programId}
              type="button"
              className={
                programFilter === opt.programId ? `${styles.filterTab} ${styles.filterTabActive}` : styles.filterTab
              }
              onClick={() => setProgramFilter(opt.programId)}
            >
              {getProgramBadgeInfo(opt.programName)?.period ?? opt.programName}
            </button>
          ))}
        </div>

        {killCapPatients.length === 0 ? (
          <p className={styles.muted}>진행중인 킬팻캡슐 환자가 없습니다.</p>
        ) : filteredPatients.length === 0 ? (
          <p className={styles.muted}>조건에 맞는 환자가 없습니다.</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>환자</th>
                <th>프로그램</th>
                <th>발송상태</th>
                <th>발송이력</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filteredPatients.map((p) => {
                const submission = submissionByPatientId.get(p.patientId);
                const sendLog = sendLogSummaries[p.patientId];
                return (
                  <tr key={p.patientId}>
                    <td>
                      {p.patientName} (<span className={styles.mono}>{p.chartNumber}</span>)
                    </td>
                    <td>
                      <ProgramBadge id={p.programId} name={p.programName} />
                    </td>
                    <td>{submission ? "발송됨" : "미발송"}</td>
                    <td>
                      {sendLog
                        ? `발송 ${sendLog.count}회 · 최근 ${formatMonthDay(sendLog.lastSentAt)} ${sendLog.lastSentByStaffName}`
                        : "미발송"}
                    </td>
                    <td>
                      {!assignment ? null : (
                        <button
                          type="button"
                          className={styles.smallButton}
                          disabled={generatingPatientId === p.patientId}
                          onClick={() => handleGenerateMessage(p.patientId, p.patientName)}
                        >
                          {generatingPatientId === p.patientId
                            ? "생성 중..."
                            : submission
                              ? "문구 다시 보기"
                              : "문구 생성"}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
