"use client";

import { useEffect, useState } from "react";
import styles from "./page.module.css";
import BackButton from "@/components/BackButton";
import {
  BODY_TYPE_QUESTIONS,
  BODY_TYPE_OTHER_VALUE,
  parseBodyTypeAnswer,
  computeDominantBodyType,
  formatDominantBodyTypeLabel,
  type TrialApplicationForFormat,
} from "@/lib/trial-application-format";

type TrialApplicationRow = TrialApplicationForFormat & {
  id: number;
  submittedAt: string;
  referralToken: string | null;
  convertedPrescriptionId: number | null;
};

function formatSubmittedAt(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function bodyTypeAnswerText(app: TrialApplicationRow, key: (typeof BODY_TYPE_QUESTIONS)[number]["key"]): string {
  const q = BODY_TYPE_QUESTIONS.find((question) => question.key === key)!;
  const values = parseBodyTypeAnswer(app[key]);
  const otherText = app[`${key}Other` as keyof TrialApplicationRow] as string | null;
  if (values.length === 0) return "미응답";
  return values
    .map((v) => {
      if (v === BODY_TYPE_OTHER_VALUE) return `기타(${otherText?.trim() || "미입력"})`;
      const label = q.options.find((o) => o.value === v)?.label;
      return label ? `${v}. ${label}` : v;
    })
    .join(" / ");
}

/**
 * 킬팻캡슐 3일체험 신청 응답 전체보기(task.md 보완 1항) — 구글폼 "응답" 탭처럼 신청 건별
 * 6문항 원본 응답 + 계산된 우세타입을 한 화면에서 펼쳐볼 수 있게 한다. 실제 처방 등록은
 * 여전히 /prescriptions/new의 "체험신청에서 가져오기" 피커에서 진행한다 — 이 화면은
 * 조회/확인 전용.
 */
export default function TrialApplicationsPage() {
  const [applications, setApplications] = useState<TrialApplicationRow[] | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/trial-applications")
      .then((res) => res.json())
      .then(setApplications);
  }, []);

  return (
    <div className={styles.container}>
      <div className={styles.titleRow}>
        <BackButton />
        <h1 className={styles.pageTitle}>체험 신청 응답</h1>
      </div>
      <p className={styles.muted}>
        공개 신청페이지(/refer/trial)로 접수된 전체 신청 목록입니다. 클릭하면 6문항 원본
        응답과 우세타입을 확인할 수 있습니다.
      </p>

      {applications === null ? (
        <p className={styles.muted}>불러오는 중...</p>
      ) : applications.length === 0 ? (
        <p className={styles.muted}>접수된 신청이 없습니다.</p>
      ) : (
        <ul className={styles.list}>
          {applications.map((app) => {
            const isExpanded = expandedId === app.id;
            const dominant = computeDominantBodyType(app);
            return (
              <li key={app.id} className={styles.item}>
                <button
                  type="button"
                  className={styles.itemHeader}
                  onClick={() => setExpandedId(isExpanded ? null : app.id)}
                >
                  <span className={styles.itemName}>
                    {app.name}
                    {app.referralToken && <span className={styles.referralTag}>추천</span>}
                    {app.convertedPrescriptionId && <span className={styles.convertedTag}>등록완료</span>}
                  </span>
                  <span className={styles.itemMeta}>
                    {app.phone} · {formatSubmittedAt(app.submittedAt)} · 우세타입{" "}
                    {formatDominantBodyTypeLabel(dominant.letters)}
                  </span>
                </button>

                {isExpanded && (
                  <div className={styles.detail}>
                    <div className={styles.detailRow}>
                      <span className={styles.detailLabel}>키/체중</span>
                      <span>{app.heightWeight || "없음"}</span>
                    </div>
                    <div className={styles.detailRow}>
                      <span className={styles.detailLabel}>감량목표(kg)</span>
                      <span>{app.weightGoalKg || "없음"}</span>
                    </div>
                    <div className={styles.detailRow}>
                      <span className={styles.detailLabel}>최근 6개월 체중변화</span>
                      <span>{app.weightChange6mo || "없음"}</span>
                    </div>
                    <div className={styles.detailRow}>
                      <span className={styles.detailLabel}>복용약물</span>
                      <span>{app.currentMeds || "없음"}</span>
                    </div>
                    <div className={styles.detailRow}>
                      <span className={styles.detailLabel}>병력</span>
                      <span>{app.pastHistory || "없음"}</span>
                    </div>
                    <div className={styles.detailRow}>
                      <span className={styles.detailLabel}>가족력</span>
                      <span>{app.familyHistory || "없음"}</span>
                    </div>
                    <div className={styles.detailRow}>
                      <span className={styles.detailLabel}>다이어트 경험</span>
                      <span>{app.dietExperience || "없음"}</span>
                    </div>

                    <hr className={styles.divider} />

                    {BODY_TYPE_QUESTIONS.map((q, index) => (
                      <div key={q.key} className={styles.detailRow}>
                        <span className={styles.detailLabel}>
                          {index + 1}. {q.question}
                        </span>
                        <span>{bodyTypeAnswerText(app, q.key)}</span>
                      </div>
                    ))}
                    <div className={styles.detailRow}>
                      <span className={styles.detailLabel}>우세타입</span>
                      <span className={styles.dominantValue}>
                        {formatDominantBodyTypeLabel(dominant.letters)} (A:{dominant.tally.A} B:{dominant.tally.B} C:
                        {dominant.tally.C} D:{dominant.tally.D} E:{dominant.tally.E})
                      </span>
                    </div>

                    {app.referralToken && (
                      <div className={styles.detailRow}>
                        <span className={styles.detailLabel}>추천코드</span>
                        <span className={styles.mono}>{app.referralToken}</span>
                      </div>
                    )}
                    <div className={styles.detailRow}>
                      <span className={styles.detailLabel}>등록 상태</span>
                      <span>
                        {app.convertedPrescriptionId
                          ? `처방 등록됨 (#${app.convertedPrescriptionId})`
                          : "미등록 — /prescriptions/new에서 등록 가능"}
                      </span>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
