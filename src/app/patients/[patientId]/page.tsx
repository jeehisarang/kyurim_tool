"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import styles from "./page.module.css";
import BackButton from "@/components/BackButton";
import ProgramBadge from "@/components/ProgramBadge";
import CategoryBadge from "@/components/CategoryBadge";
import VisitTypeTag from "@/components/VisitTypeTag";
import { useCurrentUserContext } from "@/lib/CurrentUserContext";
import { getCurrentUserId } from "@/lib/currentUser";
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
  createdAt: string;
  pastHistory: string | null;
  currentCondition: string | null;
  mainNeeds: string | null;
};

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
  staffUserName: string;
};

type VisitRow = {
  id: number;
  visitDate: string;
  isReserved: boolean;
  treatmentCategory: { id: number; name: string };
  visitType: { name: string };
};

type ProfileData = {
  patient: PatientInfo;
  activePrescriptions: PrescriptionRow[];
  inactivePrescriptions: PrescriptionRow[];
  recentExams: ExaminationRow[];
  recentVisits: VisitRow[];
};

type ConsultationNote = {
  id: number;
  visitDate: string;
  rawText: string;
  convertedChartText: string | null;
  consultationType: { id: number; name: string };
  createdByStaff: { id: number; name: string };
};

const GENDER_LABEL: Record<string, string> = { MALE: "남", FEMALE: "여" };
const STATUS_LABEL: Record<string, string> = { ACTIVE: "진행중", COMPLETED: "완료", STOPPED: "중단" };

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
}

function statusLabel(row: PrescriptionRow): string {
  if (row.program.type === "FIXED_SEQUENCE") {
    if (row.totalEventCount == null) return STATUS_LABEL[row.status] ?? row.status;
    return `${row.completedEventCount ?? 0}/${row.totalEventCount} 완료`;
  }
  if (row.currentRound != null && row.totalRounds != null) {
    return `${row.currentRound}/${row.totalRounds}차`;
  }
  return STATUS_LABEL[row.status] ?? row.status;
}

export default function PatientProfilePage() {
  const params = useParams<{ patientId: string }>();
  const router = useRouter();
  const patientId = params.patientId;

  const [data, setData] = useState<ProfileData | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [showInactive, setShowInactive] = useState(false);

  const { currentUser } = useCurrentUserContext();
  const isDirector = currentUser?.role === "원장";

  const [editingCoreProfile, setEditingCoreProfile] = useState(false);
  const [editPastHistory, setEditPastHistory] = useState("");
  const [editCurrentCondition, setEditCurrentCondition] = useState("");
  const [editMainNeeds, setEditMainNeeds] = useState("");
  const [coreProfileSaving, setCoreProfileSaving] = useState(false);
  const [coreProfileError, setCoreProfileError] = useState<string | null>(null);

  const [consultationNotes, setConsultationNotes] = useState<ConsultationNote[] | null>(null);

  useEffect(() => {
    setLoadError(false);
    fetch(`/api/patients/${patientId}/profile`)
      .then((res) => (res.ok ? res.json() : Promise.reject(res)))
      .then(setData)
      .catch(() => setLoadError(true));
  }, [patientId]);

  useEffect(() => {
    fetch(`/api/consultation-notes?patientId=${patientId}`)
      .then((res) => res.json())
      .then(setConsultationNotes);
  }, [patientId]);

  function goToPrescriptionDetail(row: PrescriptionRow) {
    router.push(`/prescriptions/${row.prescriptionId}`);
  }

  function startEditCoreProfile() {
    if (!data) return;
    setEditPastHistory(data.patient.pastHistory ?? "");
    setEditCurrentCondition(data.patient.currentCondition ?? "");
    setEditMainNeeds(data.patient.mainNeeds ?? "");
    setCoreProfileError(null);
    setEditingCoreProfile(true);
  }

  function cancelEditCoreProfile() {
    setEditingCoreProfile(false);
    setCoreProfileError(null);
  }

  async function handleSaveCoreProfile(e: React.FormEvent) {
    e.preventDefault();
    const staffUserId = getCurrentUserId();
    if (!staffUserId) {
      setCoreProfileError("상단에서 현재 사용자를 먼저 선택하세요.");
      return;
    }
    setCoreProfileSaving(true);
    setCoreProfileError(null);
    try {
      const res = await fetch(`/api/patients/${patientId}/core-profile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          staffUserId,
          pastHistory: editPastHistory,
          currentCondition: editCurrentCondition,
          mainNeeds: editMainNeeds,
        }),
      });
      const updated = await res.json();
      if (!res.ok) {
        setCoreProfileError(updated.error ?? "핵심프로필 저장에 실패했습니다.");
        return;
      }
      setData((prev) =>
        prev
          ? {
              ...prev,
              patient: {
                ...prev.patient,
                pastHistory: updated.pastHistory,
                currentCondition: updated.currentCondition,
                mainNeeds: updated.mainNeeds,
              },
            }
          : prev,
      );
      setEditingCoreProfile(false);
    } catch {
      setCoreProfileError("서버에 연결하지 못했습니다. 저장되지 않았으니 다시 시도해주세요.");
    } finally {
      setCoreProfileSaving(false);
    }
  }

  if (loadError) {
    return (
      <div className={styles.container}>
        <p className={styles.errorText}>환자 정보를 불러오지 못했습니다.</p>
        <Link href="/visit-check" className={styles.listLink}>
          ← 내원체크
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

  const { patient, activePrescriptions, inactivePrescriptions, recentExams, recentVisits } = data;

  return (
    <div className={styles.container}>
      <div className={styles.pageHeader}>
        <div className={styles.titleGroup}>
          <BackButton />
          <h1 className={styles.pageTitle}>{patient.name}님 프로필</h1>
        </div>
        <Link href="/visit-check" className={styles.listLink}>
          ← 내원체크
        </Link>
      </div>

      <div className={styles.coreProfileSection}>
        <div className={styles.sectionTitleRow}>
          <div className={styles.sectionTitle}>핵심프로필</div>
          <span className={styles.directorBadge}>원장 작성</span>
        </div>

        {!editingCoreProfile ? (
          <>
            <div className={styles.coreProfileGrid}>
              <div>
                <div className={styles.patientInfoLabel}>과거력</div>
                <p className={styles.coreProfileValue}>{patient.pastHistory ?? "-"}</p>
              </div>
              <div>
                <div className={styles.patientInfoLabel}>현재질환/주요증상</div>
                <p className={styles.coreProfileValue}>{patient.currentCondition ?? "-"}</p>
              </div>
              <div>
                <div className={styles.patientInfoLabel}>주요니즈</div>
                <p className={styles.coreProfileValue}>{patient.mainNeeds ?? "-"}</p>
              </div>
            </div>
            {isDirector && (
              <button type="button" className={styles.editButton} onClick={startEditCoreProfile}>
                수정
              </button>
            )}
          </>
        ) : (
          <form className={styles.coreProfileForm} onSubmit={handleSaveCoreProfile}>
            <label>
              과거력
              <textarea
                value={editPastHistory}
                onChange={(e) => setEditPastHistory(e.target.value)}
              />
            </label>
            <label>
              현재질환/주요증상
              <textarea
                value={editCurrentCondition}
                onChange={(e) => setEditCurrentCondition(e.target.value)}
              />
            </label>
            <label>
              주요니즈
              <textarea value={editMainNeeds} onChange={(e) => setEditMainNeeds(e.target.value)} />
            </label>
            {coreProfileError && <p className={styles.errorText}>{coreProfileError}</p>}
            <div className={styles.coreProfileFormActions}>
              <button type="submit" className={styles.editButton} disabled={coreProfileSaving}>
                저장
              </button>
              <button type="button" className={styles.editButton} onClick={cancelEditCoreProfile}>
                취소
              </button>
            </div>
          </form>
        )}
      </div>

      <div className={styles.section}>
        <div className={styles.sectionTitleRow}>
          <div className={styles.sectionTitle}>상담 이력 ({consultationNotes?.length ?? 0}건)</div>
          <span className={styles.directorBadge}>원장 작성 · 읽기 전용</span>
        </div>
        {consultationNotes === null ? (
          <p className={styles.muted}>불러오는 중...</p>
        ) : consultationNotes.length === 0 ? (
          <p className={styles.muted}>
            등록된 상담 기록이 없습니다. 작성/수정은 원장 상담모드(/consult-mode)에서만 가능합니다.
          </p>
        ) : (
          <div className={styles.consultationHistoryStack}>
            {consultationNotes.map((n) => (
              <div key={n.id} className={styles.consultationHistoryCard}>
                <div className={styles.consultationHistoryHeader}>
                  <span className={styles.consultationTypeBadge}>{n.consultationType.name}</span>
                  <span className={styles.consultationHistoryMeta}>
                    {formatDate(n.visitDate)} · {n.createdByStaff.name}
                  </span>
                </div>
                <p className={styles.consultationHistoryRaw}>{n.rawText}</p>
                {n.convertedChartText && (
                  <div className={styles.consultationHistoryConverted}>
                    <div className={styles.consultationHistoryConvertedLabel}>AI 차팅변환</div>
                    <p>{n.convertedChartText}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>기본 정보</div>
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
          <span>
            <span className={styles.patientInfoLabel}>최초 등록일</span>
            {formatDate(patient.createdAt)}
          </span>
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>진행중인 치료처방 ({activePrescriptions.length}건)</div>
        {activePrescriptions.length === 0 && <p className={styles.muted}>진행 중인 치료처방이 없습니다.</p>}
        {activePrescriptions.length > 0 && (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>프로그램</th>
                <th>차수/진행</th>
                <th>다음처방일</th>
                <th>담당자</th>
              </tr>
            </thead>
            <tbody>
              {activePrescriptions.map((row) => (
                <tr
                  key={row.prescriptionId}
                  className={styles.clickableRow}
                  onClick={() => goToPrescriptionDetail(row)}
                >
                  <td>
                    <ProgramBadge id={row.program.id} name={row.program.name} />
                  </td>
                  <td>{statusLabel(row)}</td>
                  <td className={styles.mono}>
                    {row.latestTaskDueDate ? formatDate(row.latestTaskDueDate) : "-"}
                  </td>
                  <td>{row.staffUserName}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {inactivePrescriptions.length > 0 && (
          <>
            <button
              type="button"
              className={styles.collapseToggleButton}
              onClick={() => setShowInactive((v) => !v)}
            >
              {showInactive
                ? "중단/완료 이력 접기"
                : `중단/완료 이력 보기 (${inactivePrescriptions.length}건)`}
            </button>
            {showInactive && (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>프로그램</th>
                    <th>상태</th>
                    <th>시작일</th>
                    <th>담당자</th>
                  </tr>
                </thead>
                <tbody>
                  {inactivePrescriptions.map((row) => (
                    <tr
                      key={row.prescriptionId}
                      className={styles.clickableRow}
                      onClick={() => goToPrescriptionDetail(row)}
                    >
                      <td>
                        <ProgramBadge id={row.program.id} name={row.program.name} />
                      </td>
                      <td>{STATUS_LABEL[row.status] ?? row.status}</td>
                      <td className={styles.mono}>{formatDate(row.startDate)}</td>
                      <td>{row.staffUserName}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </div>

      <div className={styles.section}>
        <div className={styles.sectionTitleRow}>
          <div className={styles.sectionTitle}>검사 이력 (최근 {recentExams.length}건)</div>
          <Link href={`/examinations/patient/${patient.id}`} className={styles.viewAllLink}>
            전체 이력 보기 →
          </Link>
        </div>
        {recentExams.length === 0 && <p className={styles.muted}>등록된 검사 기록이 없습니다.</p>}
        {recentExams.length > 0 && (
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
              </tr>
            </thead>
            <tbody>
              {recentExams.map((row) => (
                <tr key={rowKey(row)}>
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
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>최근 내원기록 (최근 {recentVisits.length}건)</div>
        {recentVisits.length === 0 && <p className={styles.muted}>내원 기록이 없습니다.</p>}
        {recentVisits.length > 0 && (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>날짜</th>
                <th>진료분야</th>
                <th>진료구분</th>
                <th>예약여부</th>
              </tr>
            </thead>
            <tbody>
              {recentVisits.map((v) => (
                <tr key={v.id}>
                  <td className={styles.mono}>{formatDate(v.visitDate)}</td>
                  <td>
                    <CategoryBadge id={v.treatmentCategory.id} name={v.treatmentCategory.name} />
                  </td>
                  <td>
                    <VisitTypeTag name={v.visitType.name} />
                  </td>
                  <td>{v.isReserved ? "예약함" : "예약안함"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
