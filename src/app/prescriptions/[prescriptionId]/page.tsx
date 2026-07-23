"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import styles from "./page.module.css";
import BackButton from "@/components/BackButton";
import ProgramBadge from "@/components/ProgramBadge";
import {
  getProgramCategory,
  PROGRAM_CATEGORY_GROUP_LABEL,
  PROGRAM_CATEGORY_ICON,
} from "@/lib/program-categories";
import { copyToClipboard } from "@/lib/clipboard";
import QrCodeImage from "@/components/QrCodeImage";

type RoundEntry = {
  round: number;
  dueDate: string;
  isDone: boolean;
  completedAt: string | null;
  isOverridden: boolean;
};
type EventEntry = {
  taskType: string;
  dueDate: string;
  status: "DONE" | "SKIPPED" | "PENDING";
  completedAt: string | null;
};
type TaskHistoryEntry = {
  id: number;
  taskType: string;
  dueDate: string | null;
  isDone: boolean;
  doneAt: string | null;
  doneByUserName: string | null;
};

type PrescriptionDetail = {
  prescriptionId: number;
  status: string;
  startDate: string;
  currentRound: number | null;
  totalRounds: number | null;
  patient: { id: number; name: string; chartNumber: string };
  program: {
    id: number;
    name: string;
    type: string;
    splitIntervalDays: number | null;
    totalDurationDays: number | null;
    followUpDays: number | null;
  };
  staffUser: { id: number; name: string };
  rounds: RoundEntry[] | null;
  singleFollowUp: RoundEntry | null;
  events: EventEntry[] | null;
  taskHistory: TaskHistoryEntry[];
  // 추천 이벤트(task.md) — FIXED_SEQUENCE 처방은 TRIAL, 킬팻캡슐 본프로그램(SPLIT) 처방은
  // MAIN 링크(task.md Phase 3-1).
  referralLink:
    | {
        token: string;
        kind: string;
        expiresAt: string;
        isActive: boolean;
        creditCount: number;
        creditTotalAmount: number;
      }
    | null;
  // "소개받음 - 3만원 할인 대상"(task.md Phase 3-2).
  introducedDiscountEligible: boolean;
};

type StaffUser = { id: number; name: string; role: string };

const STATUS_LABEL: Record<string, string> = { ACTIVE: "진행중", COMPLETED: "완료", STOPPED: "중단" };
const EVENT_LABEL: Record<string, string> = {
  TRIAL_WELCOME: "웰컴 (D0)",
  TRIAL_DAY2: "2일차 (D2)",
  TRIAL_DEADLINE: "마감 (D3)",
};
const EVENT_STATUS_LABEL: Record<string, string> = { DONE: "완료", SKIPPED: "보류", PENDING: "예정" };
const TASK_TYPE_LABEL: Record<string, string> = {
  NEXT_DOSE: "다음 처방일",
  FOLLOW_UP: "후속조치",
  TRIAL_WELCOME: "체험 웰컴톡",
  TRIAL_DAY2: "체험 2일차톡",
  TRIAL_DEADLINE: "체험 마감톡",
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
}

function toDateInputValue(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function PrescriptionDetailPage() {
  const params = useParams<{ prescriptionId: string }>();
  const prescriptionId = params.prescriptionId;

  const [data, setData] = useState<PrescriptionDetail | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [staffUsers, setStaffUsers] = useState<StaffUser[]>([]);

  const [editing, setEditing] = useState(false);
  const [editStaffUserId, setEditStaffUserId] = useState("");
  const [editStartDate, setEditStartDate] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [editingRound, setEditingRound] = useState<number | null>(null);
  const [roundOverrideDate, setRoundOverrideDate] = useState("");
  const [roundOverrideSaving, setRoundOverrideSaving] = useState(false);
  const [roundOverrideError, setRoundOverrideError] = useState<string | null>(null);

  const [referralLinkCopied, setReferralLinkCopied] = useState(false);

  // TRIAL(체험)/MAIN(본프로그램, task.md Phase 3-1)에 따라 경로가 다르다.
  function referralPath(kind: string, token: string): string {
    return kind === "MAIN" ? `/refer/main/${token}` : `/refer/trial/${token}`;
  }

  async function handleCopyReferralLink(kind: string, token: string) {
    const url = `${window.location.origin}${referralPath(kind, token)}`;
    const success = await copyToClipboard(url);
    if (!success) {
      alert("복사에 실패했습니다. 링크를 직접 선택해서 복사해주세요.");
      return;
    }
    setReferralLinkCopied(true);
    setTimeout(() => setReferralLinkCopied(false), 1500);
  }

  function refresh() {
    fetch(`/api/prescriptions/${prescriptionId}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(res)))
      .then(setData)
      .catch(() => setLoadError(true));
  }

  useEffect(() => {
    setLoadError(false);
    refresh();
    fetch("/api/staff-users")
      .then((res) => res.json())
      .then(setStaffUsers);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prescriptionId]);

  function startEdit() {
    if (!data) return;
    setEditStaffUserId(String(data.staffUser.id));
    setEditStartDate(toDateInputValue(data.startDate));
    setEditError(null);
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setEditError(null);
  }

  async function saveEdit() {
    setEditSaving(true);
    setEditError(null);
    try {
      const res = await fetch(`/api/prescriptions/${prescriptionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staffUserId: Number(editStaffUserId), startDate: editStartDate }),
      });
      const result = await res.json();
      if (!res.ok) {
        setEditError(result.error ?? "수정에 실패했습니다.");
        return;
      }
      setEditing(false);
      refresh();
    } catch {
      setEditError("서버에 연결하지 못했습니다. 다시 시도해주세요.");
    } finally {
      setEditSaving(false);
    }
  }

  function startRoundEdit(round: RoundEntry) {
    setEditingRound(round.round);
    setRoundOverrideDate(toDateInputValue(round.dueDate));
    setRoundOverrideError(null);
  }

  function cancelRoundEdit() {
    setEditingRound(null);
    setRoundOverrideError(null);
  }

  async function saveRoundOverride(round: number) {
    setRoundOverrideSaving(true);
    setRoundOverrideError(null);
    try {
      const res = await fetch(`/api/prescriptions/${prescriptionId}/rounds/${round}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ overrideDate: roundOverrideDate }),
      });
      const result = await res.json();
      if (!res.ok) {
        setRoundOverrideError(result.error ?? "수정에 실패했습니다.");
        return;
      }
      setEditingRound(null);
      setData(result);
    } catch {
      setRoundOverrideError("서버에 연결하지 못했습니다. 다시 시도해주세요.");
    } finally {
      setRoundOverrideSaving(false);
    }
  }

  async function resetRoundOverride(round: number) {
    try {
      const res = await fetch(`/api/prescriptions/${prescriptionId}/rounds/${round}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reset: true }),
      });
      if (!res.ok) {
        alert("되돌리기에 실패했습니다. 다시 시도해주세요.");
        return;
      }
      setData(await res.json());
    } catch {
      alert("서버에 연결하지 못했습니다. 다시 시도해주세요.");
    }
  }

  async function handleStop() {
    if (!data) return;
    if (!window.confirm(`"${data.program.name}" 처방을 중단하시겠습니까?\n\n목록에서 제외되며, 필요하면 다시 활성화할 수 있습니다.`)) {
      return;
    }
    try {
      const res = await fetch(`/api/prescriptions/${prescriptionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "STOPPED" }),
      });
      if (!res.ok) {
        alert("처리에 실패했습니다. 다시 시도해주세요.");
        return;
      }
      refresh();
    } catch {
      alert("서버에 연결하지 못했습니다. 다시 시도해주세요.");
    }
  }

  if (loadError) {
    return (
      <div className={styles.container}>
        <p className={styles.errorText}>치료처방 정보를 불러오지 못했습니다.</p>
        <Link href="/prescriptions" className={styles.listLink}>
          ← 치료처방 목록
        </Link>
      </div>
    );
  }

  if (!data) {
    return (
      <div className={styles.container}>
        <p className={styles.muted}>불러오는 중...</p>
      </div>
    );
  }

  const category = getProgramCategory(data.program.name);

  return (
    <div className={styles.container}>
      <div className={styles.pageHeader}>
        <div className={styles.titleGroup}>
          <BackButton />
          <h1 className={styles.pageTitle}>치료처방 상세</h1>
        </div>
        <Link href="/prescriptions" className={styles.listLink}>
          ← 치료처방 목록
        </Link>
      </div>

      <div className={styles.section}>
        <div className={styles.headerRow}>
          <ProgramBadge id={data.program.id} name={data.program.name} />
          <span className={styles.statusBadge}>{STATUS_LABEL[data.status] ?? data.status}</span>
        </div>

        <div className={styles.infoRow}>
          <span>
            <span className={styles.infoLabel}>환자</span>
            <Link href={`/patients/${data.patient.id}`} className={styles.patientLink}>
              {data.patient.name}
            </Link>{" "}
            <span className={styles.mono}>({data.patient.chartNumber})</span>
          </span>
          <span>
            <span className={styles.infoLabel}>카테고리</span>
            {category ? `${PROGRAM_CATEGORY_ICON[category]} ${PROGRAM_CATEGORY_GROUP_LABEL[category]}` : "미분류"}
          </span>
          <span>
            <span className={styles.infoLabel}>담당자</span>
            {data.staffUser.name}
          </span>
          <span>
            <span className={styles.infoLabel}>등록일</span>
            <span className={styles.mono}>{formatDate(data.startDate)}</span>
          </span>
          {data.program.totalDurationDays != null && (
            <span>
              <span className={styles.infoLabel}>총기간</span>
              {Math.round(data.program.totalDurationDays / 7)}주
            </span>
          )}
          {data.totalRounds != null && (
            <span>
              <span className={styles.infoLabel}>총회차</span>
              {data.totalRounds}회
            </span>
          )}
        </div>

        {data.status === "ACTIVE" &&
          (!editing ? (
            <div className={styles.actionsRow}>
              <button type="button" className={styles.actionButton} onClick={startEdit}>
                수정
              </button>
              <button type="button" className={styles.stopButton} onClick={handleStop}>
                중단
              </button>
            </div>
          ) : (
            <div className={styles.editRow}>
              <select value={editStaffUserId} onChange={(e) => setEditStaffUserId(e.target.value)}>
                {staffUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
              <input type="date" value={editStartDate} onChange={(e) => setEditStartDate(e.target.value)} />
              <button type="button" className={styles.actionButton} onClick={saveEdit} disabled={editSaving}>
                저장
              </button>
              <button type="button" className={styles.actionButton} onClick={cancelEdit}>
                취소
              </button>
              {editError && <p className={styles.errorText}>{editError}</p>}
            </div>
          ))}
      </div>

      {data.rounds && (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>회차별 스케줄 ({data.totalRounds}회차)</div>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>회차</th>
                <th>예정일</th>
                <th>완료여부</th>
                <th>완료일</th>
                {data.status === "ACTIVE" && <th>관리</th>}
              </tr>
            </thead>
            <tbody>
              {data.rounds.map((r) => (
                <tr key={r.round}>
                  <td>{r.round}차</td>
                  <td className={styles.mono}>
                    {editingRound === r.round ? (
                      <input
                        type="date"
                        value={roundOverrideDate}
                        onChange={(e) => setRoundOverrideDate(e.target.value)}
                      />
                    ) : (
                      <>
                        {formatDate(r.dueDate)}
                        {r.isOverridden && <span className={styles.overriddenBadge}>수정됨</span>}
                      </>
                    )}
                  </td>
                  <td>{r.isDone ? "완료" : "예정"}</td>
                  <td className={styles.mono}>{r.completedAt ? formatDate(r.completedAt) : "-"}</td>
                  {data.status === "ACTIVE" && (
                    <td>
                      {r.isDone ? null : editingRound === r.round ? (
                        <div className={styles.roundEditActions}>
                          <button
                            type="button"
                            className={styles.actionButton}
                            onClick={() => saveRoundOverride(r.round)}
                            disabled={roundOverrideSaving}
                          >
                            저장
                          </button>
                          <button type="button" className={styles.actionButton} onClick={cancelRoundEdit}>
                            취소
                          </button>
                        </div>
                      ) : (
                        <div className={styles.roundEditActions}>
                          <button type="button" className={styles.actionButton} onClick={() => startRoundEdit(r)}>
                            날짜 수정
                          </button>
                          {r.isOverridden && (
                            <button type="button" className={styles.actionButton} onClick={() => resetRoundOverride(r.round)}>
                              되돌리기
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {roundOverrideError && <p className={styles.errorText}>{roundOverrideError}</p>}
        </div>
      )}

      {data.singleFollowUp && (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>후속조치</div>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>처방일</th>
                <th>후속조치 예정일</th>
                <th>완료여부</th>
                <th>완료일</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className={styles.mono}>{formatDate(data.startDate)}</td>
                <td className={styles.mono}>{formatDate(data.singleFollowUp.dueDate)}</td>
                <td>{data.singleFollowUp.isDone ? "완료" : "예정"}</td>
                <td className={styles.mono}>
                  {data.singleFollowUp.completedAt ? formatDate(data.singleFollowUp.completedAt) : "-"}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {data.events && (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>체험 이벤트 진행상태</div>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>이벤트</th>
                <th>예정일</th>
                <th>상태</th>
                <th>처리일</th>
              </tr>
            </thead>
            <tbody>
              {data.events.map((e) => (
                <tr key={e.taskType}>
                  <td>{EVENT_LABEL[e.taskType] ?? e.taskType}</td>
                  <td className={styles.mono}>{formatDate(e.dueDate)}</td>
                  <td>{EVENT_STATUS_LABEL[e.status]}</td>
                  <td className={styles.mono}>{e.completedAt ? formatDate(e.completedAt) : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data.referralLink && (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>
            추천링크 {data.referralLink.kind === "MAIN" ? "(본프로그램)" : "(체험)"}
          </div>
          {data.introducedDiscountEligible && (
            <p className={styles.infoRow}>
              <strong>소개받음 - 3만원 할인 대상</strong>
            </p>
          )}
          <p className={styles.infoRow}>
            <span className={styles.mono}>
              {typeof window !== "undefined" ? window.location.origin : ""}
              {referralPath(data.referralLink.kind, data.referralLink.token)}
            </span>
          </p>
          <div className={styles.actionsRow}>
            <button
              type="button"
              className={styles.actionButton}
              onClick={() => handleCopyReferralLink(data.referralLink!.kind, data.referralLink!.token)}
            >
              {referralLinkCopied ? "복사됨" : "링크 복사"}
            </button>
            <span className={styles.mono}>
              {data.referralLink.isActive && new Date(data.referralLink.expiresAt).getTime() > Date.now()
                ? `${formatDate(data.referralLink.expiresAt)}까지 유효`
                : "만료됨"}
            </span>
          </div>
          {/* 적립 현황(task.md 보완 5항, Phase 3-1에서 MAIN까지 확장) — Phase 3-3 전체 환자
              통합 조회 화면(/settings/referral-credits)과 별개로 이 링크 1개 기준의 요약. */}
          <p className={styles.infoRow}>
            적립 현황: {data.referralLink.creditCount}건 · {data.referralLink.creditTotalAmount.toLocaleString()}원
          </p>
          {typeof window !== "undefined" && (
            <QrCodeImage
              value={`${window.location.origin}${referralPath(data.referralLink.kind, data.referralLink.token)}`}
              filename={`referral-qr-${data.patient.name}.png`}
            />
          )}
        </div>
      )}

      <div className={styles.section}>
        <div className={styles.sectionTitle}>오늘 할 일 이력 ({data.taskHistory.length}건)</div>
        {data.taskHistory.length === 0 && <p className={styles.muted}>연결된 할 일 이력이 없습니다.</p>}
        {data.taskHistory.length > 0 && (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>구분</th>
                <th>예정일</th>
                <th>완료여부</th>
                <th>완료일</th>
                <th>처리자</th>
              </tr>
            </thead>
            <tbody>
              {data.taskHistory.map((t) => (
                <tr key={t.id}>
                  <td>{TASK_TYPE_LABEL[t.taskType] ?? t.taskType}</td>
                  <td className={styles.mono}>{t.dueDate ? formatDate(t.dueDate) : "-"}</td>
                  <td>{t.isDone ? "완료" : "예정"}</td>
                  <td className={styles.mono}>{t.doneAt ? formatDate(t.doneAt) : "-"}</td>
                  <td>{t.doneByUserName ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
