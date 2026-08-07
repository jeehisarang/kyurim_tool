"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import styles from "./page.module.css";
import BackButton from "@/components/BackButton";
import ProgramBadge from "@/components/ProgramBadge";
import {
  getProgramCategory,
  getProgramBadgeInfo,
  PROGRAM_CATEGORY_ICON,
  type ProgramCategoryKey,
} from "@/lib/program-categories";

type PrescriptionRow = {
  prescriptionId: number;
  program: { id: number; name: string; type: string };
  startDate: string;
  status: string;
  currentRound: number | null;
  totalRounds: number | null;
  completedEventCount: number | null;
  totalEventCount: number | null;
  latestTaskDueDate: string | null;
  staffUserId: number;
  staffUserName: string;
};

type StaffUser = { id: number; name: string; role: string };

type PatientGroup = {
  patient: { id: number; name: string; chartNumber: string };
  prescriptions: PrescriptionRow[];
};

type ProgramActiveCount = { programId: number; programName: string; activePatientCount: number };
type CategoryActiveCount = {
  category: ProgramCategoryKey;
  activePatientCount: number;
  programs: ProgramActiveCount[];
};
type PrescriptionStats = {
  perProgram: ProgramActiveCount[];
  perCategory: CategoryActiveCount[];
  newThisMonth: number;
};

// 카테고리(탕약/환/킬팻캡슐)로 묶이지 않는 프로그램(전체보기 탭에서만 개별 필터 가능).
type Filter = { kind: "category"; category: ProgramCategoryKey } | { kind: "program"; programId: number };

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
}

function toDateInputValue(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function statusLabel(row: PrescriptionRow): string {
  if (row.program.type === "FIXED_SEQUENCE") {
    if (row.totalEventCount == null) return "-";
    return `${row.completedEventCount ?? 0}/${row.totalEventCount} 완료`;
  }
  if (row.currentRound != null && row.totalRounds != null) {
    return `${row.currentRound}/${row.totalRounds}차`;
  }
  return row.status === "COMPLETED" ? "완료" : "진행중";
}

function matchesFilter(row: PrescriptionRow, filter: Filter): boolean {
  if (filter.kind === "category") return getProgramCategory(row.program.name) === filter.category;
  return row.program.id === filter.programId;
}

export default function PrescriptionListPage() {
  const router = useRouter();
  const [groups, setGroups] = useState<PatientGroup[] | null>(null);
  const [stats, setStats] = useState<PrescriptionStats | null>(null);
  const [filter, setFilter] = useState<Filter | null>(null);
  const [staffUsers, setStaffUsers] = useState<StaffUser[]>([]);
  // 이름/차트번호 검색(task.md 전체 목록 화면 공통 검색기능) — 기존 카테고리/프로그램
  // 필터와 함께 동작.
  const [searchQuery, setSearchQuery] = useState("");

  const [editingPrescriptionId, setEditingPrescriptionId] = useState<number | null>(null);
  const [editStaffUserId, setEditStaffUserId] = useState("");
  const [editStartDate, setEditStartDate] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  function refresh() {
    fetch("/api/prescriptions/list")
      .then((res) => res.json())
      .then(setGroups);
    fetch("/api/prescriptions/stats")
      .then((res) => res.json())
      .then(setStats);
  }

  useEffect(() => {
    refresh();
    fetch("/api/staff-users")
      .then((res) => res.json())
      .then(setStaffUsers);
  }, []);

  function startEdit(row: PrescriptionRow) {
    setEditingPrescriptionId(row.prescriptionId);
    setEditStaffUserId(String(row.staffUserId));
    setEditStartDate(toDateInputValue(row.startDate));
    setEditError(null);
  }

  function cancelEdit() {
    setEditingPrescriptionId(null);
    setEditError(null);
  }

  async function saveEdit(prescriptionId: number) {
    setEditSaving(true);
    setEditError(null);
    try {
      const res = await fetch(`/api/prescriptions/${prescriptionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          staffUserId: Number(editStaffUserId),
          startDate: editStartDate,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setEditError(data.error ?? "수정에 실패했습니다.");
        return;
      }
      setEditingPrescriptionId(null);
      refresh();
    } catch {
      setEditError("서버에 연결하지 못했습니다. 다시 시도해주세요.");
    } finally {
      setEditSaving(false);
    }
  }

  async function handleStop(row: PrescriptionRow) {
    if (
      !window.confirm(
        `"${row.program.name}" 처방을 중단하시겠습니까?\n\n목록에서 제외되며, 필요하면 다시 활성화할 수 있습니다.`,
      )
    ) {
      return;
    }
    try {
      const res = await fetch(`/api/prescriptions/${row.prescriptionId}`, {
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

  // task2.md: 회차/후속조치를 다 완료했다고 해서 자동으로 처방을 종료하지 않고, 직원이
  // 직접 확인 후 이 버튼으로 수동 전환한다.
  async function handleComplete(row: PrescriptionRow) {
    if (!window.confirm(`"${row.program.name}" 처방을 완료 처리하시겠습니까?`)) {
      return;
    }
    try {
      const res = await fetch(`/api/prescriptions/${row.prescriptionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "COMPLETED" }),
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

  // 카테고리에 속하지 않는 프로그램(예: 미분류 "킬팻캡슐" 기본형)도 진행 중인 환자가
  // 있으면 개별 카드/탭으로는 계속 보이게 한다 — 완전히 숨기지 않음.
  const categorizedProgramIds = useMemo(
    () => new Set(stats?.perCategory.flatMap((c) => c.programs.map((p) => p.programId)) ?? []),
    [stats],
  );
  const uncategorizedPrograms = useMemo(
    () => stats?.perProgram.filter((p) => !categorizedProgramIds.has(p.programId)) ?? [],
    [stats, categorizedProgramIds],
  );

  // 킬팻캡슐 세부 필터(task.md 2단 구조) — 3일체험/1개월/3개월을 tier 순서(짧다→길다)로
  // 정렬해 "전체/3일체험/1개월/3개월" 서브 필터 버튼을 만든다. 상단 요약카드와 동일한
  // stats.perCategory 데이터를 그대로 재사용해 집계 기준이 갈라지지 않게 한다(task.md 요구사항).
  const killCapSubPrograms = useMemo(() => {
    const programs = stats?.perCategory.find((c) => c.category === "킬팻캡슐")?.programs ?? [];
    return [...programs].sort((a, b) => {
      const tierA = getProgramBadgeInfo(a.programName)?.tier ?? 99;
      const tierB = getProgramBadgeInfo(b.programName)?.tier ?? 99;
      return tierA - tierB;
    });
  }, [stats]);

  // 세부 필터(1개월/3개월 등)를 고른 뒤에도 서브 필터 행과 상위 "킬팻캡슐" 버튼이 계속
  // 활성 표시로 남아있어야 다른 세부 항목으로 바로 전환할 수 있다 — category 필터일 때뿐
  // 아니라 killCapSubPrograms에 속한 program 필터일 때도 "킬팻캡슐 활성"으로 간주한다.
  const isKillCapCategoryActive =
    (filter?.kind === "category" && filter.category === "킬팻캡슐") ||
    (filter?.kind === "program" && killCapSubPrograms.some((p) => p.programId === filter.programId));

  const filteredGroups = useMemo(() => {
    if (!groups) return [];
    let result = groups;
    if (filter) {
      result = result.filter((g) => g.prescriptions.some((row) => matchesFilter(row, filter)));
    }
    const q = searchQuery.trim();
    if (q) {
      result = result.filter((g) => g.patient.name.includes(q) || g.patient.chartNumber.includes(q));
    }
    return result;
  }, [groups, filter, searchQuery]);

  function goToPrescriptionDetail(row: PrescriptionRow) {
    router.push(`/prescriptions/${row.prescriptionId}`);
  }

  function isFilterActive(candidate: Filter): boolean {
    if (!filter) return false;
    if (filter.kind !== candidate.kind) return false;
    if (filter.kind === "category" && candidate.kind === "category") {
      return filter.category === candidate.category;
    }
    if (filter.kind === "program" && candidate.kind === "program") {
      return filter.programId === candidate.programId;
    }
    return false;
  }

  return (
    <div className={styles.container}>
      <div className={styles.pageHeader}>
        <div className={styles.titleGroup}>
          <BackButton />
          <h1 className={styles.pageTitle}>치료처방 목록</h1>
        </div>
        <Link href="/prescriptions/new" className={styles.newLink}>
          + 신규 등록
        </Link>
      </div>

      {stats && (
        <div className={styles.cardGrid}>
          <div className={styles.statCard}>
            <div className={styles.statValue}>{stats.newThisMonth}</div>
            <div className={styles.statLabel}>이번달 신규 등록</div>
          </div>

          {stats.perCategory.map((c) => (
            <button
              key={c.category}
              type="button"
              className={styles.categoryCard}
              onClick={() => setFilter({ kind: "category", category: c.category })}
            >
              <div className={styles.statValue}>{c.activePatientCount}</div>
              <div className={styles.statLabel}>
                {PROGRAM_CATEGORY_ICON[c.category]} {c.category} 진행중
              </div>
              {/* 개별 프로그램 단위 숫자도 완전히 숨기지 않고 카드 아래 작게 유지 */}
              <div className={styles.categoryDetail}>
                {c.programs.map((p) => `${p.programName} ${p.activePatientCount}`).join(" · ")}
              </div>
            </button>
          ))}

          {uncategorizedPrograms.map((p) => (
            <button
              key={p.programId}
              type="button"
              className={styles.categoryCard}
              onClick={() => setFilter({ kind: "program", programId: p.programId })}
            >
              <div className={styles.statValue}>{p.activePatientCount}</div>
              <div className={styles.statLabel} title={p.programName}>
                {p.programName} 진행중
              </div>
            </button>
          ))}
        </div>
      )}

      <input
        type="text"
        className={styles.searchInput}
        placeholder="차트번호 또는 이름으로 검색"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
      />

      <div className={styles.filterRow}>
        <button
          type="button"
          className={filter === null ? styles.filterButtonActive : styles.filterButton}
          onClick={() => setFilter(null)}
        >
          전체보기
        </button>
        {stats?.perCategory.map((c) => (
          <button
            key={c.category}
            type="button"
            className={
              // 킬팻캡슐은 세부 필터(1개월/3개월 등) 선택 중에도 상위 버튼이 계속 활성으로
              // 보여야 한다(isKillCapCategoryActive가 그 경우까지 포함해서 계산해준다).
              (c.category === "킬팻캡슐" ? isKillCapCategoryActive : isFilterActive({ kind: "category", category: c.category }))
                ? styles.filterButtonActive
                : styles.filterButton
            }
            onClick={() => setFilter({ kind: "category", category: c.category })}
          >
            {PROGRAM_CATEGORY_ICON[c.category]} {c.category}
          </button>
        ))}
        {uncategorizedPrograms.map((p) => (
          <button
            key={p.programId}
            type="button"
            className={
              isFilterActive({ kind: "program", programId: p.programId })
                ? styles.filterButtonActive
                : styles.filterButton
            }
            onClick={() => setFilter({ kind: "program", programId: p.programId })}
          >
            {p.programName}
          </button>
        ))}
      </div>

      {/* 킬팻캡슐 세부 필터(2단, task.md) — 1단에서 킬팻캡슐 카테고리를 선택했을 때만 노출 */}
      {isKillCapCategoryActive && killCapSubPrograms.length > 0 && (
        <div className={styles.subFilterRow}>
          <button
            type="button"
            className={
              filter?.kind === "category" ? styles.subFilterButtonActive : styles.subFilterButton
            }
            onClick={() => setFilter({ kind: "category", category: "킬팻캡슐" })}
          >
            킬팻캡슐 전체
          </button>
          {killCapSubPrograms.map((p) => (
            <button
              key={p.programId}
              type="button"
              className={
                isFilterActive({ kind: "program", programId: p.programId })
                  ? styles.subFilterButtonActive
                  : styles.subFilterButton
              }
              onClick={() => setFilter({ kind: "program", programId: p.programId })}
            >
              {getProgramBadgeInfo(p.programName)?.period ?? p.programName}
            </button>
          ))}
        </div>
      )}

      <div className={styles.section}>
        {groups === null && <p className={styles.muted}>불러오는 중...</p>}
        {groups !== null && filteredGroups.length === 0 && (
          <p className={styles.muted}>진행 중인 치료처방이 없습니다.</p>
        )}
        {filteredGroups.length > 0 && (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>환자명</th>
                <th>진행 중인 프로그램</th>
                <th>최초 등록일</th>
              </tr>
            </thead>
            <tbody>
              {filteredGroups.map((g) => (
                <tr key={g.patient.id}>
                  <td>
                    <Link href={`/patients/${g.patient.id}`} className={styles.patientNameLink}>
                      {g.patient.name}
                    </Link>{" "}
                    <span className={styles.mono}>({g.patient.chartNumber})</span>
                    <Link
                      href={`/examinations/new?patientId=${g.patient.id}`}
                      className={styles.examLink}
                    >
                      검사
                    </Link>
                  </td>
                  <td>
                    <div className={styles.badgeRow}>
                      {g.prescriptions.map((row) => {
                        const isEditing = editingPrescriptionId === row.prescriptionId;
                        return (
                          <div key={row.prescriptionId} className={styles.programChip}>
                            {/* truncate 미사용: "가족명 · 기간"이 잘리면 배지 구분성 개선의
                                취지(예: 킬캡3체험 vs 킬캡3개월)가 무의미해진다 — 프로그램명은
                                항상 짧게 관리되므로 flex-wrap 컨테이너 안에서 전체 노출해도 무방. */}
                            <ProgramBadge
                              id={row.program.id}
                              name={row.program.name}
                              onClick={() => goToPrescriptionDetail(row)}
                            />
                            <span className={styles.chipStatus}>{statusLabel(row)}</span>
                            <span className={styles.chipStatus}>담당: {row.staffUserName}</span>

                            {isEditing ? (
                              <div className={styles.chipEditRow}>
                                <select
                                  value={editStaffUserId}
                                  onChange={(e) => setEditStaffUserId(e.target.value)}
                                >
                                  {staffUsers.map((u) => (
                                    <option key={u.id} value={u.id}>
                                      {u.name}
                                    </option>
                                  ))}
                                </select>
                                <input
                                  type="date"
                                  value={editStartDate}
                                  onChange={(e) => setEditStartDate(e.target.value)}
                                />
                                <button
                                  type="button"
                                  className={styles.chipActionButton}
                                  onClick={() => saveEdit(row.prescriptionId)}
                                  disabled={editSaving}
                                >
                                  저장
                                </button>
                                <button
                                  type="button"
                                  className={styles.chipActionButton}
                                  onClick={cancelEdit}
                                >
                                  취소
                                </button>
                                {editError && <p className={styles.errorText}>{editError}</p>}
                              </div>
                            ) : (
                              <div className={styles.chipActions}>
                                <button
                                  type="button"
                                  className={styles.chipActionButton}
                                  onClick={() => startEdit(row)}
                                >
                                  수정
                                </button>
                                <button
                                  type="button"
                                  className={styles.chipActionButton}
                                  onClick={() => handleComplete(row)}
                                >
                                  완료
                                </button>
                                <button
                                  type="button"
                                  className={styles.chipStopButton}
                                  onClick={() => handleStop(row)}
                                >
                                  중단
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </td>
                  <td className={styles.mono}>
                    {formatDate(
                      g.prescriptions.reduce(
                        (min, p) => (p.startDate < min ? p.startDate : min),
                        g.prescriptions[0].startDate,
                      ),
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
