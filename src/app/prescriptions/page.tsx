"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import styles from "./page.module.css";
import CategoryBadge from "@/components/CategoryBadge";

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
};

type PatientGroup = {
  patient: { id: number; name: string; chartNumber: string };
  prescriptions: PrescriptionRow[];
};

type ProgramActiveCount = { programId: number; programName: string; activePatientCount: number };
type PrescriptionStats = { perProgram: ProgramActiveCount[]; newThisMonth: number };

function toDateParam(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
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

export default function PrescriptionListPage() {
  const router = useRouter();
  const [groups, setGroups] = useState<PatientGroup[] | null>(null);
  const [stats, setStats] = useState<PrescriptionStats | null>(null);
  const [filterProgramId, setFilterProgramId] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/prescriptions/list")
      .then((res) => res.json())
      .then(setGroups);
    fetch("/api/prescriptions/stats")
      .then((res) => res.json())
      .then(setStats);
  }, []);

  const filteredGroups = useMemo(() => {
    if (!groups) return [];
    if (filterProgramId === null) return groups;
    return groups.filter((g) => g.prescriptions.some((p) => p.program.id === filterProgramId));
  }, [groups, filterProgramId]);

  function goToProgress(row: PrescriptionRow) {
    const reference = row.latestTaskDueDate ?? row.startDate;
    router.push(`/todo?date=${toDateParam(reference)}`);
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
          {stats.perProgram.map((p) => (
            <div key={p.programId} className={styles.statCard}>
              <div className={styles.statValue}>{p.activePatientCount}</div>
              <div className={styles.statLabel} title={p.programName}>
                {p.programName} 진행중
              </div>
            </div>
          ))}
        </div>
      )}

      <div className={styles.filterRow}>
        <button
          type="button"
          className={filterProgramId === null ? styles.filterButtonActive : styles.filterButton}
          onClick={() => setFilterProgramId(null)}
        >
          전체보기
        </button>
        {stats?.perProgram.map((p) => (
          <button
            key={p.programId}
            type="button"
            className={filterProgramId === p.programId ? styles.filterButtonActive : styles.filterButton}
            onClick={() => setFilterProgramId(p.programId)}
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
                      {g.prescriptions.map((row) => (
                        <div key={row.prescriptionId} className={styles.programChip}>
                          <CategoryBadge
                            id={row.program.id}
                            name={row.program.name}
                            truncate
                            onClick={() => goToProgress(row)}
                          />
                          <span className={styles.chipStatus}>{statusLabel(row)}</span>
                        </div>
                      ))}
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
