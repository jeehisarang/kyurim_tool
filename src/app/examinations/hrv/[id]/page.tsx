"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import styles from "./page.module.css";
import BackButton from "@/components/BackButton";
import ImageZoomPan from "@/components/ImageZoomPan";
import HrvCommentaryCards from "@/components/HrvCommentaryCards";
import { openPatientViewPopup, HRV_PATIENT_VIEW_POPUP_SIZE } from "@/lib/patient-view-popup";

type HrvDetail = {
  id: number;
  patient: { id: number; name: string; chartNumber: string };
  testDate: string;
  vascularHealthIndex: number;
  vascularHealthType: string;
  avgPulse: number;
  stressIndex: number;
  sourceImagePath: string;
  sourceImagePath2: string | null;
  aiCommentary: string | null;
  aiDeviceReading: string | null;
  aiClinicalMeaning: string | null;
  aiLifestyleGuide: string | null;
  aiTcmInterpretation: string | null;
  measuredByStaff: { name: string };
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
}

/**
 * HRV 원장 전용 확인 화면(task.md 4번) — "환자와 함께보기"와 달리 AI 코멘트 4단 섹션을
 * 직접 수작업 편집할 수 있다(ProgramTeachingCreator와 동일한 필드별 textarea 저장 패턴).
 * 수정/삭제 등 내부 전용 기능은 이 화면에만 두고, 환자 화면(patient-view)에는 절대 노출하지
 * 않는다(화이트리스트 원칙 유지).
 */
export default function HrvExaminationDetailPage() {
  const params = useParams<{ id: string }>();
  const { id } = params;

  const [detail, setDetail] = useState<HrvDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editDeviceReading, setEditDeviceReading] = useState("");
  const [editClinicalMeaning, setEditClinicalMeaning] = useState("");
  const [editLifestyleGuide, setEditLifestyleGuide] = useState("");
  const [editTcmInterpretation, setEditTcmInterpretation] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [popupBlocked, setPopupBlocked] = useState(false);

  function loadDetail() {
    fetch(`/api/hrv-records/${id}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(res)))
      .then((data: HrvDetail) => setDetail(data))
      .catch(() => setLoadError("검사기록을 불러오지 못했습니다."));
  }

  useEffect(() => {
    loadDetail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  function startEdit() {
    if (!detail) return;
    setSaveError(null);
    setEditDeviceReading(detail.aiDeviceReading ?? "");
    setEditClinicalMeaning(detail.aiClinicalMeaning ?? "");
    setEditLifestyleGuide(detail.aiLifestyleGuide ?? "");
    setEditTcmInterpretation(detail.aiTcmInterpretation ?? "");
    setEditing(true);
  }

  async function saveEdit() {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/hrv-records/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceReading: editDeviceReading,
          clinicalMeaning: editClinicalMeaning,
          lifestyleGuide: editLifestyleGuide,
          tcmInterpretation: editTcmInterpretation,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setSaveError(data.error ?? "저장에 실패했습니다.");
        return;
      }
      setEditing(false);
      loadDetail();
    } catch {
      setSaveError("서버에 연결하지 못했습니다. 저장되지 않았으니 다시 시도해주세요.");
    } finally {
      setSaving(false);
    }
  }

  function handleOpenPatientView() {
    if (!detail) return;
    setPopupBlocked(false);
    const blocked = openPatientViewPopup(`/patient-view/exam/hrv/${detail.id}`, HRV_PATIENT_VIEW_POPUP_SIZE);
    if (blocked) setPopupBlocked(true);
  }

  if (loadError) {
    return (
      <div className={styles.container}>
        <p className={styles.errorText}>{loadError}</p>
        <Link href="/examinations" className={styles.listLink}>
          ← 검사 목록
        </Link>
      </div>
    );
  }

  if (!detail) {
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
          <h1 className={styles.pageTitle}>HRV 검사 상세 — {detail.patient.name}</h1>
        </div>
        <Link href={`/examinations/patient/${detail.patient.id}`} className={styles.listLink}>
          ← 검사 이력
        </Link>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>환자 정보</div>
        <p>
          <strong>{detail.patient.name}</strong> <span className={styles.mono}>({detail.patient.chartNumber})</span>
        </p>
        <p className={styles.muted}>
          측정일: {formatDate(detail.testDate)} · 측정자: {detail.measuredByStaff.name}
        </p>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>검사 결과</div>
        <div className={styles.resultGrid}>
          <div className={styles.resultRow}>
            <span>혈관건강지수</span>
            <span className={styles.resultValue}>{detail.vascularHealthIndex}</span>
          </div>
          <div className={styles.resultRow}>
            <span>혈관건강도</span>
            <span className={styles.resultValue}>{detail.vascularHealthType}</span>
          </div>
          <div className={styles.resultRow}>
            <span>평균맥박</span>
            <span className={styles.resultValue}>{detail.avgPulse}</span>
          </div>
          <div className={styles.resultRow}>
            <span>스트레스지수</span>
            <span className={styles.resultValue}>{detail.stressIndex}</span>
          </div>
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>결과지 원본</div>
        <div className={styles.imageStack}>
          <ImageZoomPan src={detail.sourceImagePath} alt="HRV 결과지 1페이지" />
          {detail.sourceImagePath2 && <ImageZoomPan src={detail.sourceImagePath2} alt="HRV 결과지 2페이지" />}
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>AI 코멘트</div>

        {!editing && (
          <>
            <HrvCommentaryCards
              sections={{
                deviceReading: detail.aiDeviceReading,
                clinicalMeaning: detail.aiClinicalMeaning,
                lifestyleGuide: detail.aiLifestyleGuide,
                tcmInterpretation: detail.aiTcmInterpretation,
              }}
              legacyText={detail.aiCommentary}
            />
            <div className={styles.actionRow}>
              <button type="button" className={styles.editButton} onClick={startEdit}>
                코멘트 수정
              </button>
              <button type="button" className={styles.patientViewButton} onClick={handleOpenPatientView}>
                환자와 함께보기
              </button>
            </div>
            {popupBlocked && (
              <p className={styles.errorText}>
                팝업이 차단되었습니다. 브라우저 주소창의 팝업 차단 아이콘을 눌러 이 사이트의 팝업을 허용한 뒤
                다시 시도해주세요.
              </p>
            )}
          </>
        )}

        {editing && (
          <>
            <label className={styles.editLabel}>
              기기 판독 요약
              <textarea
                className={styles.editTextarea}
                rows={3}
                value={editDeviceReading}
                onChange={(e) => setEditDeviceReading(e.target.value)}
              />
            </label>
            <label className={styles.editLabel}>
              임상적 의미
              <textarea
                className={styles.editTextarea}
                rows={4}
                value={editClinicalMeaning}
                onChange={(e) => setEditClinicalMeaning(e.target.value)}
              />
            </label>
            <label className={styles.editLabel}>
              생활관리 안내
              <textarea
                className={styles.editTextarea}
                rows={3}
                value={editLifestyleGuide}
                onChange={(e) => setEditLifestyleGuide(e.target.value)}
              />
            </label>
            <label className={styles.editLabel}>
              한의학적 해석
              <textarea
                className={styles.editTextarea}
                rows={4}
                value={editTcmInterpretation}
                onChange={(e) => setEditTcmInterpretation(e.target.value)}
              />
            </label>

            {saveError && <p className={styles.errorText}>{saveError}</p>}

            <div className={styles.actionRow}>
              <button type="button" className={styles.submitButton} onClick={saveEdit} disabled={saving}>
                {saving ? "저장 중..." : "저장"}
              </button>
              <button type="button" className={styles.editButton} onClick={() => setEditing(false)}>
                취소
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
