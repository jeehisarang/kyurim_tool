"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import styles from "./page.module.css";
import CategoryBadge from "@/components/CategoryBadge";
import {
  getProgramCategory,
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

function toDateParam(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

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
    await fetch(`/api/prescriptions/${row.prescriptionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "STOPPED" }),
    });
    refresh();
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

  const filteredGroups = useMemo(() => {
    if (!groups) return [];
    if (!filter) return groups;
    return groups.filter((g) => g.prescriptions.some((row) => matchesFilter(row, filter)));
  }, [groups, filter]);

  function goToProgress(row: PrescriptionRow) {
    const reference = row.latestTaskDueDate ?? row.startDate;
    router.push(`/todo?date=${toDateParam(reference)}`);
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
        <h1 className={styles.pageTitle}>치료처방 목록</h1>
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
              isFilterActive({ kind: "category", category: c.category })
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
                    {g.patient.name}{" "}
                    <span className={styles.mono}>({g.patient.chartNumber})</span>
                  </td>
                  <td>
                    <div className={styles.badgeRow}>
                      {g.prescriptions.map((row) => {
                        const category = getProgramCategory(row.program.name);
                        const isEditing = editingPrescriptionId === row.prescriptionId;
                        return (
                          <div key={row.prescriptionId} className={styles.programChip}>
                            <CategoryBadge
                              id={row.program.id}
                              name={row.program.name}
                              truncate
                              onClick={() => goToProgress(row)}
                              categoryKey={category ?? undefined}
                              icon={category ? PROGRAM_CATEGORY_ICON[category] : undefined}
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
