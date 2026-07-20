"use client";

import { useState } from "react";
import styles from "./ExamShareSections.module.css";
import ImageZoomPan from "@/components/ImageZoomPan";
import HrvCommentaryCards from "@/components/HrvCommentaryCards";
import HrvHealthReportCards from "@/components/HrvHealthReportCards";
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

// 검사종류마다 날짜 필드명이 달라(examDate vs testDate) 정렬/아코디언 키 계산에 공통으로 쓴다.
function entryDate(entry: ShareLinkExamEntry): string {
  return entry.examType === "HRV" ? entry.testDate : entry.examDate;
}

function entryKey(entry: ShareLinkExamEntry): string {
  return `${entry.examType}-${entry.id}`;
}

// 접힌 항목 헤더용 핵심 수치 요약(task.md PART A) — hrvSummaryLabel(examination-format.ts)과
// 동일한 문구 형식을 이 컴포넌트가 받는 화이트리스트 뷰(ShareLinkExamEntry) 타입에 맞춰
// 그대로 재구성한다(원본 헬퍼는 스태프 전용 ExaminationRow 타입을 받아 여기서 직접 재사용은
// 불가능 — 형식만 동일하게 맞춤).
function entrySummary(entry: ShareLinkExamEntry): string {
  if (entry.examType === "BODY_COMPOSITION") {
    return `체중 ${entry.weightKg}kg · 체지방율 ${entry.bodyFatPercent}%`;
  }
  if (entry.examType === "STRENGTH_TEST") {
    return `악력평균 ${entry.gripAvgKg.toFixed(1)}kg (${entry.gripJudgementLabel})`;
  }
  const stress = entry.stressIndex === null ? "-" : entry.stressIndex;
  return `혈관건강지수 ${entry.vascularHealthIndex}(${entry.vascularHealthType}) · 맥박 ${entry.avgPulse} · 스트레스 ${stress}`;
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
 *
 * 이전 검사기록 접기/펼치기(task.md PART A, 스크롤 단축) — 검사종류별로 독립적으로 최신
 * 1건만 기본 펼침, 나머지는 접힌 상태(날짜 + 핵심 수치 요약만)로 시작한다. 섹션 앵커
 * (#exam-${examType})는 그 종류의 최신 항목(=항상 펼쳐진 상태)으로 연결되므로 별도 처리
 * 없이도 "앵커 클릭 시 펼쳐진 내용으로 스크롤"이 자연히 만족된다.
 */
export default function ExamShareSections({ exams }: { exams: ShareLinkExamEntry[] }) {
  const byType = new Map<string, ShareLinkExamEntry[]>();
  for (const entry of exams) {
    const list = byType.get(entry.examType) ?? [];
    list.push(entry);
    byType.set(entry.examType, list);
  }
  // 검사종류별로 최신순 정렬 — examLinks 저장 순서가 날짜순이라는 보장이 없어(PatientShareLinkExam
  // 생성 순서일 뿐) 여기서 직접 정렬해야 "최신 1건 펼침" 기준이 정확해진다.
  const groups = [...byType.entries()].map(
    ([examType, entries]) =>
      [examType, [...entries].sort((a, b) => (entryDate(a) < entryDate(b) ? 1 : -1))] as const,
  );

  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const [, entries] of groups) {
      entries.forEach((entry, i) => {
        initial[entryKey(entry)] = i === 0; // 그룹 내 최신(정렬 후 첫 항목)만 기본 펼침
      });
    }
    return initial;
  });

  function toggle(key: string) {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  if (exams.length === 0) return null;

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
          {entries.map((entry) => {
            const key = entryKey(entry);
            const isOpen = expanded[key];
            return (
              <div key={key} className={styles.examEntry}>
                <button
                  type="button"
                  className={styles.accordionHeader}
                  onClick={() => toggle(key)}
                  aria-expanded={isOpen}
                >
                  <span className={styles.accordionHeaderText}>
                    {formatDate(entryDate(entry))} · {entrySummary(entry)}
                  </span>
                  <span className={styles.accordionChevron}>{isOpen ? "▲" : "▼"}</span>
                </button>
                {isOpen && (
                  <>
                    {entry.examType === "BODY_COMPOSITION" && <BodyCompositionEntry entry={entry} />}
                    {entry.examType === "STRENGTH_TEST" && <StrengthTestEntry entry={entry} />}
                    {entry.examType === "HRV" && <HrvEntry entry={entry} />}
                  </>
                )}
              </div>
            );
          })}
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
          {entry.stressIndex === null ? (
            <span className={styles.metricValueUnmeasured}>측정 안 함</span>
          ) : (
            <span className={`${styles.metricValue} ${severityClass(entry.stressIndexSeverity)}`}>
              {entry.stressIndex}
            </span>
          )}
        </div>
      </div>

      {entry.healthReport ? (
        <HrvHealthReportCards
          cards={entry.healthReport}
          detailSummary={{
            stressIndex: entry.stressIndex,
            vascularHealthIndex: entry.vascularHealthIndex,
            vascularHealthType: entry.vascularHealthType,
          }}
          detailValues={{
            tp: entry.tp,
            vlf: entry.vlf,
            lf: entry.lf,
            hf: entry.hf,
            lfHfRatio: entry.lfHfRatio,
            sdnn: entry.sdnn,
            rmssd: entry.rmssd,
          }}
          variant="patient"
        />
      ) : (
        <HrvCommentaryCards
          sections={entry.sections ?? { deviceReading: null, clinicalMeaning: null, lifestyleGuide: null, tcmInterpretation: null }}
          legacyText={entry.legacyCommentary}
          variant="patient"
          commentaryVersion={entry.commentaryVersion}
        />
      )}

      <div className={styles.safetyNoticeBox}>
        <div className={styles.safetyNoticeLabel}>안전 안내</div>
        <p>{HRV_SAFETY_NOTICE}</p>
      </div>
    </div>
  );
}
