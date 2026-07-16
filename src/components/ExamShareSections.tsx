"use client";

import styles from "./ExamShareSections.module.css";
import ImageZoomPan from "@/components/ImageZoomPan";
import HrvCommentaryCards from "@/components/HrvCommentaryCards";
import { HRV_SAFETY_NOTICE } from "@/lib/hrv-constants";
import { EXAM_TYPE_LABEL } from "@/lib/examination-format";
import type { HrvSeverity } from "@/lib/hrv-thresholds";
import type { ShareLinkExamEntry } from "@/lib/share-links";

const EXAM_TYPE_TITLE: Record<string, string> = {
  BODY_COMPOSITION: "인바디 검사 결과",
  STRENGTH_TEST: "근력검사 결과",
  HRV: "자율신경맥파기(HRV) 검사 결과",
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
}

function severityClass(severity: HrvSeverity | null): string {
  if (severity === "NORMAL") return styles.metricValueNormal;
  if (severity === "CAUTION") return styles.metricValueCaution;
  if (severity === "DANGER") return styles.metricValueDanger;
  return "";
}

/**
 * 검사톡(task.md) 환자용 페이지 전용 — 기존 "환자와함께보기"(원장실 팝업, 1100x980 고정폭
 * 가정) 레이아웃을 재사용하지 않고 모바일 열람을 전제로 새로 만든다(원장님 결정사항 2번).
 * 데이터는 toPatientSafeExamView/toPatientSafeHrvView가 이미 화이트리스트 변환을 마친
 * 값(share-links.ts)을 그대로 받아 그리기만 한다 — 원장 전용 필드는 애초에 이 객체에
 * 존재하지 않는다.
 *
 * 검사 종류(examType)별로 섹션을 묶고, 종류가 2개 이상이면 상단 앵커 네비게이션을 보여준다
 * (1개면 생략 — task.md 4번). 같은 종류를 여러 건 포함한 경우 그 섹션 안에 최신순으로 나열한다.
 */
export default function ExamShareSections({ exams }: { exams: ShareLinkExamEntry[] }) {
  if (exams.length === 0) return null;

  const byType = new Map<string, ShareLinkExamEntry[]>();
  for (const entry of exams) {
    const list = byType.get(entry.examType) ?? [];
    list.push(entry);
    byType.set(entry.examType, list);
  }
  const groups = [...byType.entries()];

  return (
    <div className={styles.wrap}>
      {groups.length > 1 && (
        <nav className={styles.anchorNav}>
          {groups.map(([examType]) => (
            <a key={examType} href={`#exam-${examType}`} className={styles.anchorLink}>
              {EXAM_TYPE_LABEL[examType as keyof typeof EXAM_TYPE_LABEL] ?? examType}
            </a>
          ))}
        </nav>
      )}

      {groups.map(([examType, entries]) => (
        <section key={examType} id={`exam-${examType}`} className={styles.examSection}>
          <h2 className={styles.examSectionTitle}>{EXAM_TYPE_TITLE[examType] ?? examType}</h2>
          {entries.map((entry) => (
            <div key={entry.id} className={styles.examEntry}>
              {entry.examType === "BODY_COMPOSITION" && <BodyCompositionEntry entry={entry} />}
              {entry.examType === "STRENGTH_TEST" && <StrengthTestEntry entry={entry} />}
              {entry.examType === "HRV" && <HrvEntry entry={entry} />}
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}

function BodyCompositionEntry({ entry }: { entry: Extract<ShareLinkExamEntry, { examType: "BODY_COMPOSITION" }> }) {
  return (
    <div className={styles.card}>
      <p className={styles.entryDate}>{formatDate(entry.examDate)}</p>
      <div className={styles.resultGrid}>
        <div className={styles.resultRow}>
          <span className={styles.resultLabel}>체중</span>
          <span className={styles.resultValue}>{entry.weightKg}kg</span>
        </div>
        {entry.bmi != null && (
          <div className={styles.resultRow}>
            <span className={styles.resultLabel}>BMI</span>
            <span className={styles.resultValue}>{entry.bmi.toFixed(1)}</span>
          </div>
        )}
        <div className={styles.resultRow}>
          <span className={styles.resultLabel}>체지방율</span>
          <span className={styles.resultValue}>{entry.bodyFatPercent}%</span>
        </div>
        <div className={styles.resultRow}>
          <span className={styles.resultLabel}>WHR</span>
          <span className={styles.resultValue}>{entry.whr}</span>
        </div>
        {entry.smi != null && (
          <div className={styles.resultRow}>
            <span className={styles.resultLabel}>SMI (골격근량 지수)</span>
            <span className={styles.resultValue}>{entry.smi.toFixed(2)}</span>
          </div>
        )}
      </div>
      {entry.smiPatientLabel && <div className={styles.messageBox}>{entry.smiPatientLabel}</div>}
      {entry.aiExplanation && <p className={styles.explanationBox}>{entry.aiExplanation}</p>}
    </div>
  );
}

function StrengthTestEntry({ entry }: { entry: Extract<ShareLinkExamEntry, { examType: "STRENGTH_TEST" }> }) {
  return (
    <div className={styles.card}>
      <p className={styles.entryDate}>{formatDate(entry.examDate)}</p>
      <div className={styles.resultGrid}>
        <div className={styles.resultRow}>
          <span className={styles.resultLabel}>악력 (좌 / 우)</span>
          <span className={styles.resultValue}>
            {entry.gripLeftKg}kg / {entry.gripRightKg}kg
          </span>
        </div>
        <div className={styles.resultRow}>
          <span className={styles.resultLabel}>악력 평균</span>
          <span className={styles.resultValue}>{entry.gripAvgKg.toFixed(1)}kg</span>
        </div>
        <div className={styles.resultRow}>
          <span className={styles.resultLabel}>판정</span>
          <span className={styles.resultValue}>{entry.gripJudgementLabel}</span>
        </div>
      </div>
      <div className={styles.messageBox}>{entry.gripAgeMessage}</div>
      {entry.aiExplanation && <p className={styles.explanationBox}>{entry.aiExplanation}</p>}
    </div>
  );
}

function HrvEntry({ entry }: { entry: Extract<ShareLinkExamEntry, { examType: "HRV" }> }) {
  return (
    <div className={styles.card}>
      <p className={styles.entryDate}>{formatDate(entry.testDate)}</p>

      <div className={styles.imageStack}>
        <ImageZoomPan src={entry.sourceImagePath} alt="HRV 결과지 1페이지" viewportHeight="360px" />
        {entry.sourceImagePath2 && (
          <ImageZoomPan src={entry.sourceImagePath2} alt="HRV 결과지 2페이지" viewportHeight="360px" />
        )}
      </div>

      <div className={styles.metricGrid}>
        <div className={styles.metricRow}>
          <span className={styles.metricLabel}>혈관건강지수</span>
          <span className={`${styles.metricValue} ${severityClass(entry.vascularHealthIndexSeverity)}`}>
            {entry.vascularHealthIndex}
          </span>
        </div>
        <div className={styles.metricRow}>
          <span className={styles.metricLabel}>혈관건강도</span>
          <span className={`${styles.metricValue} ${severityClass(entry.vascularHealthTypeSeverity)}`}>
            {entry.vascularHealthType}
          </span>
        </div>
        <div className={styles.metricRow}>
          <span className={styles.metricLabel}>평균맥박</span>
          <span className={`${styles.metricValue} ${severityClass(entry.avgPulseSeverity)}`}>{entry.avgPulse}</span>
        </div>
        <div className={styles.metricRow}>
          <span className={styles.metricLabel}>스트레스지수</span>
          <span className={`${styles.metricValue} ${severityClass(entry.stressIndexSeverity)}`}>
            {entry.stressIndex}
          </span>
        </div>
      </div>

      <HrvCommentaryCards
        sections={entry.sections ?? { deviceReading: null, clinicalMeaning: null, lifestyleGuide: null, tcmInterpretation: null }}
        legacyText={entry.legacyCommentary}
        variant="patient"
      />

      <div className={styles.safetyNoticeBox}>
        <div className={styles.safetyNoticeLabel}>안전 안내</div>
        <p>{HRV_SAFETY_NOTICE}</p>
      </div>
    </div>
  );
}
