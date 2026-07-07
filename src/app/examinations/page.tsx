"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import styles from "./page.module.css";

type ExaminationRow =
  | {
      id: number;
      examType: "BODY_COMPOSITION";
      patient: { id: number; name: string; chartNumber: string };
      measuredAt: string;
      staffUserName: string;
      weightKg: number;
      note: string | null;
    }
  | {
      id: number;
      examType: "STRENGTH_TEST";
      patient: { id: number; name: string; chartNumber: string };
      measuredAt: string;
      staffUserName: string;
      smi: number;
      smiJudgement: "NORMAL" | "SARCOPENIA";
      gripAvgKg: number;
      gripJudgement: "WEAK" | "NORMAL" | "STRONG" | "UNKNOWN";
    };

const EXAM_TYPE_LABEL = {
  BODY_COMPOSITION: "인바디",
  STRENGTH_TEST: "근력검사",
};

const SMI_JUDGEMENT_LABEL: Record<string, string> = {
  NORMAL: "정상",
  SARCOPENIA: "근감소증 의심",
};

const GRIP_JUDGEMENT_LABEL: Record<string, string> = {
  WEAK: "약함",
  NORMAL: "정상",
  STRONG: "강함",
  UNKNOWN: "판정불가",
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
}

function primaryValue(row: ExaminationRow): string {
  if (row.examType === "BODY_COMPOSITION") return `${row.weightKg}kg`;
  return `SMI ${row.smi.toFixed(2)} / 악력 ${row.gripAvgKg.toFixed(1)}kg`;
}

function judgementLabel(row: ExaminationRow): string {
  if (row.examType === "BODY_COMPOSITION") return "-";
  return `근력: ${SMI_JUDGEMENT_LABEL[row.smiJudgement]} / 악력: ${GRIP_JUDGEMENT_LABEL[row.gripJudgement]}`;
}

function isJudgementConcerning(row: ExaminationRow): boolean {
  return row.examType === "STRENGTH_TEST" && (row.smiJudgement === "SARCOPENIA" || row.gripJudgement === "WEAK");
}

export default function ExaminationListPage() {
  const [rows, setRows] = useState<ExaminationRow[] | null>(null);
  const [patientFilter, setPatientFilter] = useState("");

  useEffect(() => {
    fetch("/api/examinations")
      .then((res) => res.json())
      .then(setRows);
  }, []);

  const filteredRows = useMemo(() => {
    if (!rows) return [];
    const q = patientFilter.trim();
    if (!q) return rows;
    return rows.filter((r) => r.patient.name.includes(q) || r.patient.chartNumber.includes(q));
  }, [rows, patientFilter]);

  return (
    <div className={styles.container}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>검사 목록</h1>
        <Link href="/examinations/new" className={styles.newLink}>
          + 신규 등록
        </Link>
      </div>

      <div className={styles.filterRow}>
        <input
          type="text"
          placeholder="환자명 또는 차트번호로 필터"
          value={patientFilter}
          onChange={(e) => setPatientFilter(e.target.value)}
        />
      </div>

      <div className={styles.section}>
        {rows === null && <p className={styles.muted}>불러오는 중...</p>}
        {rows !== null && filteredRows.length === 0 && (
          <p className={styles.muted}>등록된 검사가 없습니다.</p>
        )}
        {filteredRows.length > 0 && (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>환자명</th>
                <th>검사종류</th>
                <th>측정일</th>
                <th>주요 수치</th>
                <th>판정</th>
                <th>측정자</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => (
                <tr key={`${row.examType}-${row.id}`}>
                  <td>
                    {row.patient.name} <span className={styles.mono}>({row.patient.chartNumber})</span>
                  </td>
                  <td>{EXAM_TYPE_LABEL[row.examType]}</td>
                  <td className={styles.mono}>{formatDate(row.measuredAt)}</td>
                  <td className={styles.mono}>{primaryValue(row)}</td>
                  <td className={isJudgementConcerning(row) ? styles.judgementBad : undefined}>
                    {judgementLabel(row)}
                  </td>
                  <td>{row.staffUserName}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
