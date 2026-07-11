"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import styles from "./page.module.css";
import BackButton from "@/components/BackButton";
import {
  type ExaminationRow,
  EXAM_TYPE_LABEL,
  bmiCell,
  formatExamDate,
  gripAgeLabel,
  gripLabel,
  isSmiConcerning,
  rowKey,
  smiLabel,
  weightCell,
} from "@/lib/examination-format";

type PatientInfo = {
  id: number;
  name: string;
  chartNumber: string;
  height: number | null;
  gender: "MALE" | "FEMALE" | null;
};

const GENDER_LABEL: Record<string, string> = { MALE: "남", FEMALE: "여" };

export default function PatientExamHistoryPage() {
  const params = useParams<{ patientId: string }>();
  const router = useRouter();
  const patientId = params.patientId;

  const [patient, setPatient] = useState<PatientInfo | null>(null);
  const [rows, setRows] = useState<ExaminationRow[] | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    setLoadError(false);
    Promise.all([
      fetch(`/api/patients/${patientId}`).then((res) => (res.ok ? res.json() : Promise.reject(res))),
      fetch(`/api/examinations?patientId=${patientId}`).then((res) =>
        res.ok ? res.json() : Promise.reject(res),
      ),
    ])
      .then(([patientData, examRows]) => {
        setPatient(patientData);
        setRows(examRows);
      })
      .catch(() => setLoadError(true));
  }, [patientId]);

  if (loadError) {
    return (
      <div className={styles.container}>
        <p className={styles.errorText}>환자 정보를 불러오지 못했습니다.</p>
        <Link href="/examinations" className={styles.listLink}>
          ← 검사 목록
        </Link>
      </div>
    );
  }

  if (!patient || !rows) {
    return (
      <div className={styles.container}>
        <p className={styles.muted}>불러오는 중...</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.pageHeader}>
        <div className={styles.titleGroup}>
          <BackButton />
          <h1 className={styles.pageTitle}>{patient.name}님 검사이력</h1>
        </div>
        <Link href="/examinations" className={styles.listLink}>
          ← 검사 목록
        </Link>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>환자 정보</div>
        <div className={styles.patientInfoRow}>
          <span>
            <span className={styles.patientInfoLabel}>이름</span>
            <strong>{patient.name}</strong>
          </span>
          <span>
            <span className={styles.patientInfoLabel}>차트번호</span>
            <span className={styles.mono}>{patient.chartNumber}</span>
          </span>
          <span>
            <span className={styles.patientInfoLabel}>키</span>
            {patient.height != null ? `${patient.height}cm` : "-"}
          </span>
          <span>
            <span className={styles.patientInfoLabel}>성별</span>
            {patient.gender ? GENDER_LABEL[patient.gender] : "-"}
          </span>
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionTitleRow}>
          <div className={styles.sectionTitle}>검사 이력 ({rows.length}건)</div>
          <Link href={`/examinations/new?patientId=${patient.id}`} className={styles.newExamButton}>
            + 새 검사 등록
          </Link>
        </div>

        {rows.length === 0 && <p className={styles.muted}>등록된 검사 기록이 없습니다.</p>}

        {rows.length > 0 && (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>검사종류</th>
                <th>측정일</th>
                <th>체중</th>
                <th>BMI</th>
                <th>SMI(판정)</th>
                <th>악력(판정)</th>
                <th>근력나이</th>
                <th>측정자</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={rowKey(row)}
                  className={styles.clickableRow}
                  onClick={() => router.push(`/examinations/${row.examType}/${row.id}`)}
                >
                  <td>
                    <span className={styles.examTypeBadge}>{EXAM_TYPE_LABEL[row.examType]}</span>
                  </td>
                  <td className={styles.mono}>{formatExamDate(row.examDate)}</td>
                  <td className={styles.mono}>{weightCell(row)}</td>
                  <td className={styles.mono}>{bmiCell(row)}</td>
                  <td className={isSmiConcerning(row) ? styles.judgementBad : undefined}>
                    {smiLabel(row)}
                  </td>
                  <td
                    className={
                      row.examType === "STRENGTH_TEST" && row.gripJudgement === "WEAK"
                        ? styles.judgementBad
                        : undefined
                    }
                  >
                    {gripLabel(row)}
                  </td>
                  <td>{gripAgeLabel(row)}</td>
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
