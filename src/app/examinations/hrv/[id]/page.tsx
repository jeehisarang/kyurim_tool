"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import styles from "./page.module.css";
import BackButton from "@/components/BackButton";
import ImageZoomPan from "@/components/ImageZoomPan";
import HrvCommentaryCards from "@/components/HrvCommentaryCards";
import HrvHealthReportCards from "@/components/HrvHealthReportCards";
import { toHealthReportCards } from "@/lib/patient-view";
import { openPatientViewPopup, HRV_PATIENT_VIEW_POPUP_SIZE } from "@/lib/patient-view-popup";
import { downloadElementAsPdf, downloadElementAsPng, buildHealthReportFileName } from "@/lib/export-health-report";

type HrvDetail = {
  id: number;
  patient: { id: number; name: string; chartNumber: string };
  testDate: string;
  vascularHealthIndex: number;
  vascularHealthType: string;
  avgPulse: number;
  stressIndex: number | null;
  sourceImagePath: string;
  sourceImagePath2: string | null;
  aiCommentary: string | null;
  aiDeviceReading: string | null;
  aiClinicalMeaning: string | null;
  aiLifestyleGuide: string | null;
  aiTcmInterpretation: string | null;
  // 건강 리포트(task.md 7카드 리뉴얼) 전용 필드 — HEALTH_REPORT_V1이 아니면 항상 null.
  aiProgressionCard: string | null;
  aiCheckedSymptomsJson: string | null;
  aiRedFlagNotice: string | null;
  aiTreatmentCardsJson: string | null;
  aiCategoryScoreBarsJson: string | null;
  aiCommentaryVersion: string | null;
  // 유비오맥파 CSV 자동연동(task.md) 레코드는 담당 직원 정보가 없어 null.
  measuredByStaff: { name: string } | null;
  // 소프트 삭제 여부(task.md PART D) — 비활성 레코드는 다운로드 버튼을 숨긴다.
  isActive: boolean;
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
  const router = useRouter();

  const [detail, setDetail] = useState<HrvDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editDeviceReading, setEditDeviceReading] = useState("");
  const [editClinicalMeaning, setEditClinicalMeaning] = useState("");
  const [editLifestyleGuide, setEditLifestyleGuide] = useState("");
  const [editTcmInterpretation, setEditTcmInterpretation] = useState("");
  const [editProgression, setEditProgression] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [popupBlocked, setPopupBlocked] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [regenerateError, setRegenerateError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // 건강 리포트 PDF/이미지 다운로드(task.md PART D) — 카드 영역 DOM을 그대로 캡처한다.
  const reportRef = useRef<HTMLDivElement>(null);
  const [downloadMenuOpen, setDownloadMenuOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

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
    setEditProgression(detail.aiProgressionCard ?? "");
    setEditing(true);
  }

  async function saveEdit() {
    if (!detail) return;
    setSaving(true);
    setSaveError(null);
    try {
      // 건강 리포트(HEALTH_REPORT_V1)는 카드2/3/6(체크증상/주목할 변화/위험신호)이 코드 계산
      // 데이터라 이 화면에서 직접 편집하지 않는다 — 4개 AI 텍스트 카드만 편집 대상이다.
      // 레거시 버전은 옛 4필드(clinicalMeaning 포함)를 그대로 편집한다(회귀 방지).
      const isHealthReportNow = detail.aiCommentaryVersion === "HEALTH_REPORT_V1";
      const body = isHealthReportNow
        ? {
            headline: editDeviceReading,
            tcmInterpretation: editTcmInterpretation,
            progression: editProgression,
            treatmentAndLifestyle: editLifestyleGuide,
          }
        : {
            headline: editDeviceReading,
            clinicalMeaning: editClinicalMeaning,
            treatmentAndLifestyle: editLifestyleGuide,
            tcmInterpretation: editTcmInterpretation,
          };
      const res = await fetch(`/api/hrv-records/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
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

  // 소프트 삭제(task2.md) — Visit 삭제와 동일 권한 원칙(별도 제한 없음). 삭제 후에는 이
  // 화면 자체가 더는 의미가 없으니 환자 검사이력으로 돌려보낸다.
  async function handleDelete() {
    if (!detail) return;
    if (!window.confirm("이 검사 기록을 삭제하시겠습니까? (목록/통계에서 제외되며, 필요하면 목록에서 다시 볼 수 있습니다)")) {
      return;
    }
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/hrv-records/${id}`, { method: "DELETE" });
      if (!res.ok) {
        setDeleteError("삭제에 실패했습니다. 다시 시도해주세요.");
        return;
      }
      router.push(`/examinations/patient/${detail.patient.id}`);
    } catch {
      setDeleteError("서버에 연결하지 못했습니다. 삭제되지 않았으니 다시 시도해주세요.");
    } finally {
      setDeleting(false);
    }
  }

  function handleOpenPatientView() {
    if (!detail) return;
    setPopupBlocked(false);
    const blocked = openPatientViewPopup(`/patient-view/exam/hrv/${detail.id}`, HRV_PATIENT_VIEW_POPUP_SIZE);
    if (blocked) setPopupBlocked(true);
  }

  // 건강 리포트 PDF/이미지 다운로드(task.md PART D) — "환자와함께보기"에 보이는 카드 콘텐츠와
  // 동일한 데이터(신버전 7카드 또는 레거시 4섹션)를 이 화면에 이미 렌더링된 DOM 그대로
  // 캡처한다. 레거시/신버전 구조 차이는 신경 쓰지 않는다 — 어느 쪽이든 reportRef가 가리키는
  // 영역을 그대로 이미지화한다.
  async function handleDownload(format: "pdf" | "png") {
    if (!detail || !reportRef.current) return;
    setDownloading(true);
    setDownloadError(null);
    setDownloadMenuOpen(false);
    // "환자와 함께보기" 클릭에서 남은 팝업 차단 안내가 다운로드 버튼 근처에 계속 떠 있으면
    // 마치 다운로드가 팝업 차단에 걸린 것처럼 보인다(task.md 버그 리포트) — 다운로드 시도
    // 시점에 이전 상태를 지운다.
    setPopupBlocked(false);
    try {
      const fileName = buildHealthReportFileName(detail.patient.name, detail.testDate, format);
      if (format === "pdf") {
        await downloadElementAsPdf(reportRef.current, fileName);
      } else {
        await downloadElementAsPng(reportRef.current, fileName);
      }
    } catch {
      setDownloadError("다운로드에 실패했습니다. 다시 시도해주세요.");
    } finally {
      setDownloading(false);
    }
  }

  // 학술근거/매핑표를 새로 저장한 뒤 이미 생성된 기존 검사기록에도 반영하려면 이 버튼이
  // 필요하다(task.md — "재생성해도 그대로"였던 원인은 강제 재생성 수단 자체의 부재였음).
  // 수작업 편집분까지 덮어쓰므로 확인창을 거친다.
  async function handleRegenerate() {
    if (!window.confirm("건강 리포트를 최신 학술근거로 다시 만듭니다. 지금 저장된 내용(수작업 수정 포함)은 덮어써집니다. 계속하시겠습니까?")) {
      return;
    }
    setRegenerating(true);
    setRegenerateError(null);
    try {
      const res = await fetch(`/api/hrv-records/${id}/generate-commentary`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: true }),
      });
      const data = await res.json();
      if (!res.ok || !data.sections) {
        setRegenerateError("재생성에 실패했습니다. 잠시 후 다시 시도해주세요.");
        return;
      }
      loadDetail();
    } catch {
      setRegenerateError("서버에 연결하지 못했습니다. 다시 시도해주세요.");
    } finally {
      setRegenerating(false);
    }
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

  // 편집폼 라벨/순서도 코멘트 버전에 맞춰야 제목과 내용이 어긋나지 않는다(task2.md 확인사항,
  // HrvCommentaryCards의 SECTION_LABELS_MIBYEONG/LEGACY와 동일한 라벨을 그대로 씀).
  // 코멘트 생성 실패 표시(task.md 작업 C) — 수동 등록/CSV 자동임포트 모두 저장 시점에
  // AI 코멘트 생성을 시도하지만(hrv.ts tryGenerateHrvCommentary), 실패해도 검사 저장 자체는
  // 성공하도록 null만 남기고 조용히 넘어간다(safety-first 원칙). 그 결과 두 섹션 필드가
  // 전부 비어 HrvCommentaryCards가 아무것도 렌더링하지 않는 경우, 원장이 "코멘트가 아직
  // 없는 정상 상태"인지 "생성이 실패한 것"인지 구분할 수 없었던 게 이번 작업의 확인 대상.
  // 미매칭 대기열(HrvImportPending)과는 별개 개념 — 이미 정상 생성된 검사기록인데 코멘트만
  // 실패한 경우를 여기서 표시한다.
  const commentaryGenerationFailed = !detail.aiDeviceReading && !detail.aiCommentary;

  const isHealthReport = detail.aiCommentaryVersion === "HEALTH_REPORT_V1";
  const isMibyeong = detail.aiCommentaryVersion === "MIBYEONG_V1";
  const healthReportCards = isHealthReport ? toHealthReportCards(detail) : null;

  const editFields = isHealthReport
    ? [
        { label: "카드1: 헤드라인", value: editDeviceReading, onChange: setEditDeviceReading, rows: 3 },
        { label: "카드4: 한의건강해석", value: editTcmInterpretation, onChange: setEditTcmInterpretation, rows: 4 },
        { label: "카드5: 이런 경향이 지속되면", value: editProgression, onChange: setEditProgression, rows: 3 },
        { label: "카드7: 치료방향 & 생활관리", value: editLifestyleGuide, onChange: setEditLifestyleGuide, rows: 4 },
      ]
    : isMibyeong
      ? [
          { label: "미병(未病) 도입", value: editDeviceReading, onChange: setEditDeviceReading, rows: 3 },
          { label: "이번 결과와 추이", value: editClinicalMeaning, onChange: setEditClinicalMeaning, rows: 4 },
          { label: "한의학적 해석", value: editTcmInterpretation, onChange: setEditTcmInterpretation, rows: 4 },
          { label: "치미병 양생 안내", value: editLifestyleGuide, onChange: setEditLifestyleGuide, rows: 3 },
        ]
      : [
          { label: "기기 판독 요약", value: editDeviceReading, onChange: setEditDeviceReading, rows: 3 },
          { label: "임상적 의미", value: editClinicalMeaning, onChange: setEditClinicalMeaning, rows: 4 },
          { label: "생활관리 안내", value: editLifestyleGuide, onChange: setEditLifestyleGuide, rows: 3 },
          { label: "한의학적 해석", value: editTcmInterpretation, onChange: setEditTcmInterpretation, rows: 4 },
        ];

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
          측정일: {formatDate(detail.testDate)} · 측정자: {detail.measuredByStaff?.name ?? "자동연동(유비오맥파 CSV)"}
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
            <span className={styles.resultValue}>{detail.stressIndex === null ? "측정 안 함" : detail.stressIndex}</span>
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
        <div className={styles.sectionTitle}>건강 리포트</div>

        {!editing && (
          <>
            {commentaryGenerationFailed && (
              <p className={styles.commentaryFailedNotice}>
                ⚠ 리포트 생성 실패 — 검사 기록은 정상 저장됐지만 건강 리포트 생성에 실패했습니다.
                아래 &quot;리포트 다시 만들기&quot; 버튼으로 다시 시도해주세요.
              </p>
            )}
            <div ref={reportRef}>
              {healthReportCards ? (
                <HrvHealthReportCards cards={healthReportCards} />
              ) : (
                <HrvCommentaryCards
                  sections={{
                    deviceReading: detail.aiDeviceReading,
                    clinicalMeaning: detail.aiClinicalMeaning,
                    lifestyleGuide: detail.aiLifestyleGuide,
                    tcmInterpretation: detail.aiTcmInterpretation,
                  }}
                  legacyText={detail.aiCommentary}
                  commentaryVersion={detail.aiCommentaryVersion}
                />
              )}
            </div>
            <div className={styles.actionRow}>
              <button type="button" className={styles.editButton} onClick={startEdit}>
                리포트 수정
              </button>
              <button type="button" className={styles.editButton} onClick={handleRegenerate} disabled={regenerating}>
                {regenerating ? "재생성 중..." : "리포트 다시 만들기"}
              </button>
              <button type="button" className={styles.patientViewButton} onClick={handleOpenPatientView}>
                환자와 함께보기
              </button>
              {detail.isActive && (
                <div className={styles.downloadWrap}>
                  <button
                    type="button"
                    className={styles.editButton}
                    onClick={() => setDownloadMenuOpen((v) => !v)}
                    disabled={downloading}
                  >
                    {downloading ? "다운로드 중..." : "다운로드"}
                  </button>
                  {downloadMenuOpen && (
                    <div className={styles.downloadMenu}>
                      <button type="button" onClick={() => handleDownload("pdf")}>
                        PDF로 저장
                      </button>
                      <button type="button" onClick={() => handleDownload("png")}>
                        이미지(PNG)로 저장
                      </button>
                    </div>
                  )}
                </div>
              )}
              <button type="button" className={styles.deleteButton} onClick={handleDelete} disabled={deleting}>
                {deleting ? "삭제 중..." : "삭제"}
              </button>
            </div>
            {regenerateError && <p className={styles.errorText}>{regenerateError}</p>}
            {downloadError && <p className={styles.errorText}>{downloadError}</p>}
            {deleteError && <p className={styles.errorText}>{deleteError}</p>}
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
            {editFields.map((field) => (
              <label key={field.label} className={styles.editLabel}>
                {field.label}
                <textarea
                  className={styles.editTextarea}
                  rows={field.rows}
                  value={field.value}
                  onChange={(e) => field.onChange(e.target.value)}
                />
              </label>
            ))}

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
