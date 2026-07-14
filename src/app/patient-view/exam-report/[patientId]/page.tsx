"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import styles from "./page.module.css";
import PatientViewLayout from "@/components/PatientViewLayout";
import layoutStyles from "@/components/PatientViewLayout.module.css";
import {
  planPatientExamReport,
  toPatientSafeExamView,
  type PatientSafeBodyComposition,
  type PatientSafeStrengthTest,
} from "@/lib/patient-view";
import type { ExaminationRow } from "@/lib/examination-format";

type BodySection =
  | { kind: "none" }
  | { kind: "single"; result: PatientSafeBodyComposition }
  | {
      kind: "trend";
      points: { examDate: string; weightKg: number; bodyFatPercent: number }[];
      // 가장 최근 검사의 AI 해설 코멘트(task.md) — 추이(2건 이상) 뷰는 상세 필드가 없어
      // 별도로 최신 레코드 하나만 더 불러와 채운다.
      aiExplanation: string | null;
    };

type StrengthSection =
  | { kind: "none" }
  | { kind: "single"; result: PatientSafeStrengthTest }
  | {
      kind: "trend";
      points: { examDate: string; gripAvgKg: number; estimatedGripAge: number | null }[];
      aiExplanation: string | null;
    };

async function ensureExplanation(
  examType: "BODY_COMPOSITION" | "STRENGTH_TEST",
  id: number,
): Promise<string | null> {
  try {
    const res = await fetch(`/api/examinations/${examType}/${id}/explain`, { method: "POST" });
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data?.aiExplanation === "string" ? data.aiExplanation : null;
  } catch {
    return null;
  }
}

function formatShortDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export default function PatientExamReportPage() {
  const params = useParams<{ patientId: string }>();
  const { patientId } = params;

  const [patientName, setPatientName] = useState<string | null>(null);
  const [bodySection, setBodySection] = useState<BodySection | null>(null);
  const [strengthSection, setStrengthSection] = useState<StrengthSection | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoadError(false);

    async function load() {
      try {
        const [patientRes, rowsRes] = await Promise.all([
          fetch(`/api/patients/${patientId}`),
          fetch(`/api/examinations?patientId=${patientId}`),
        ]);
        if (!patientRes.ok || !rowsRes.ok) throw new Error("불러오기 실패");

        const patient = await patientRes.json();
        const rows: ExaminationRow[] = await rowsRes.json();
        const plan = planPatientExamReport(rows);

        // "가장 최근 검사"의 상세(좌/우 악력 등 목록 API에 없는 필드 + AI 해설 코멘트)를
        // 불러오기 위해, 목록(rows)에서 직접 최신 레코드 id를 구한다 — "1건뿐"(single)일
        // 때는 그 1건이 곧 최신이고, "2건 이상"(trend)일 때도 해설 코멘트만은 최신 1건
        // 것을 보여줘야 하므로(task.md) kind와 무관하게 항상 최신 id로 상세를 불러온다.
        const bodyRowsAsc = rows
          .filter((r): r is Extract<ExaminationRow, { examType: "BODY_COMPOSITION" }> => r.examType === "BODY_COMPOSITION")
          .sort((a, b) => a.examDate.localeCompare(b.examDate));
        const strengthRowsAsc = rows
          .filter((r): r is Extract<ExaminationRow, { examType: "STRENGTH_TEST" }> => r.examType === "STRENGTH_TEST")
          .sort((a, b) => a.examDate.localeCompare(b.examDate));
        const latestBodyId = bodyRowsAsc.length > 0 ? bodyRowsAsc[bodyRowsAsc.length - 1].id : null;
        const latestStrengthId = strengthRowsAsc.length > 0 ? strengthRowsAsc[strengthRowsAsc.length - 1].id : null;

        const [bodyDetail, strengthDetail] = await Promise.all([
          latestBodyId !== null
            ? fetch(`/api/examinations/BODY_COMPOSITION/${latestBodyId}`).then((r) => (r.ok ? r.json() : null))
            : null,
          latestStrengthId !== null
            ? fetch(`/api/examinations/STRENGTH_TEST/${latestStrengthId}`).then((r) => (r.ok ? r.json() : null))
            : null,
        ]);

        if (cancelled) return;

        setPatientName(patient.name);

        const bodySafe = bodyDetail ? (toPatientSafeExamView(bodyDetail) as PatientSafeBodyComposition) : null;
        const strengthSafe = strengthDetail
          ? (toPatientSafeExamView(strengthDetail) as PatientSafeStrengthTest)
          : null;

        if (plan.bodyComposition.kind === "none") {
          setBodySection({ kind: "none" });
        } else if (plan.bodyComposition.kind === "single" && bodySafe) {
          setBodySection({ kind: "single", result: bodySafe });
        } else if (plan.bodyComposition.kind === "trend") {
          setBodySection({
            kind: "trend",
            points: plan.bodyComposition.points,
            aiExplanation: bodySafe?.aiExplanation ?? null,
          });
        } else {
          setBodySection({ kind: "none" });
        }

        if (plan.strengthTest.kind === "none") {
          setStrengthSection({ kind: "none" });
        } else if (plan.strengthTest.kind === "single" && strengthSafe) {
          setStrengthSection({ kind: "single", result: strengthSafe });
        } else if (plan.strengthTest.kind === "trend") {
          setStrengthSection({
            kind: "trend",
            points: plan.strengthTest.points,
            aiExplanation: strengthSafe?.aiExplanation ?? null,
          });
        } else {
          setStrengthSection({ kind: "none" });
        }

        // 과거 레코드(aiExplanation=null)는 즉석 생성 후 캐싱한다(task.md) — 실패해도
        // 조용히 무시(설명 문단만 안 보임, /patient-view/exam 페이지와 동일 원칙).
        if (bodySafe && bodySafe.aiExplanation === null && latestBodyId !== null) {
          ensureExplanation("BODY_COMPOSITION", latestBodyId).then((explanation) => {
            if (cancelled || !explanation) return;
            setBodySection((prev) =>
              prev?.kind === "single"
                ? { kind: "single", result: { ...prev.result, aiExplanation: explanation } }
                : prev?.kind === "trend"
                  ? { ...prev, aiExplanation: explanation }
                  : prev,
            );
          });
        }
        if (strengthSafe && strengthSafe.aiExplanation === null && latestStrengthId !== null) {
          ensureExplanation("STRENGTH_TEST", latestStrengthId).then((explanation) => {
            if (cancelled || !explanation) return;
            setStrengthSection((prev) =>
              prev?.kind === "single"
                ? { kind: "single", result: { ...prev.result, aiExplanation: explanation } }
                : prev?.kind === "trend"
                  ? { ...prev, aiExplanation: explanation }
                  : prev,
            );
          });
        }
      } catch {
        if (!cancelled) setLoadError(true);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [patientId]);

  if (loadError) {
    return (
      <PatientViewLayout title="검사 종합 리포트">
        <p className={layoutStyles.errorText}>결과를 불러오지 못했습니다.</p>
      </PatientViewLayout>
    );
  }

  if (!bodySection || !strengthSection) {
    return (
      <PatientViewLayout title="검사 종합 리포트">
        <p className={layoutStyles.loadingText}>불러오는 중...</p>
      </PatientViewLayout>
    );
  }

  const hasNothing = bodySection.kind === "none" && strengthSection.kind === "none";

  return (
    <PatientViewLayout title={patientName ? `${patientName}님 검사 리포트` : "검사 종합 리포트"}>
      {hasNothing && <p className={layoutStyles.loadingText}>등록된 검사 기록이 없습니다.</p>}

      {bodySection.kind !== "none" && (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>인바디</div>

          {bodySection.kind === "single" ? (
            <div className={styles.resultGrid}>
              <div className={styles.resultRow}>
                <span className={styles.resultLabel}>체중</span>
                <span className={styles.resultValue}>{bodySection.result.weightKg}kg</span>
              </div>
              {bodySection.result.bmi != null && (
                <div className={styles.resultRow}>
                  <span className={styles.resultLabel}>BMI</span>
                  <span className={styles.resultValue}>{bodySection.result.bmi.toFixed(1)}</span>
                </div>
              )}
              <div className={styles.resultRow}>
                <span className={styles.resultLabel}>체지방율</span>
                <span className={styles.resultValue}>{bodySection.result.bodyFatPercent}%</span>
              </div>
              {bodySection.result.smiPatientLabel && (
                <div className={styles.messageBox}>{bodySection.result.smiPatientLabel}</div>
              )}
              {bodySection.result.aiExplanation && (
                <p className={styles.explanationBox}>{bodySection.result.aiExplanation}</p>
              )}
            </div>
          ) : (
            <>
              <p className={styles.chartCaption}>체중·체지방율 추이</p>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart
                  data={bodySection.points.map((p) => ({
                    day: formatShortDate(p.examDate),
                    weightKg: p.weightKg,
                    bodyFatPercent: p.bodyFatPercent,
                  }))}
                  margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                >
                  <CartesianGrid stroke="rgba(110, 148, 140, 0.2)" vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 12, fill: "var(--color-ink)" }} tickLine={false} />
                  <YAxis
                    yAxisId="weight"
                    tick={{ fontSize: 12, fill: "var(--color-ink)" }}
                    tickLine={false}
                    axisLine={false}
                    width={36}
                  />
                  <YAxis
                    yAxisId="fat"
                    orientation="right"
                    tick={{ fontSize: 12, fill: "var(--color-ink)" }}
                    tickLine={false}
                    axisLine={false}
                    width={36}
                    tickFormatter={(v) => `${v}%`}
                  />
                  <Tooltip
                    formatter={(value, name) =>
                      name === "bodyFatPercent" ? [`${value}%`, "체지방율"] : [`${value}kg`, "체중"]
                    }
                  />
                  <Line
                    yAxisId="weight"
                    type="monotone"
                    dataKey="weightKg"
                    name="weightKg"
                    stroke="var(--color-celadon-dark)"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                  <Line
                    yAxisId="fat"
                    type="monotone"
                    dataKey="bodyFatPercent"
                    name="bodyFatPercent"
                    stroke="var(--color-seal)"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
              {bodySection.aiExplanation && (
                <p className={styles.explanationBox}>{bodySection.aiExplanation}</p>
              )}
            </>
          )}
        </div>
      )}

      {strengthSection.kind !== "none" && (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>근력검사</div>

          {strengthSection.kind === "single" ? (
            <div className={styles.resultGrid}>
              <div className={styles.resultRow}>
                <span className={styles.resultLabel}>악력 (좌 / 우)</span>
                <span className={styles.resultValue}>
                  {strengthSection.result.gripLeftKg}kg / {strengthSection.result.gripRightKg}kg
                </span>
              </div>
              <div className={styles.resultRow}>
                <span className={styles.resultLabel}>악력 평균</span>
                <span className={styles.resultValue}>{strengthSection.result.gripAvgKg.toFixed(1)}kg</span>
              </div>
              <div className={styles.resultRow}>
                <span className={styles.resultLabel}>판정</span>
                <span className={styles.resultValue}>{strengthSection.result.gripJudgementLabel}</span>
              </div>
              <div className={styles.messageBox}>{strengthSection.result.gripAgeMessage}</div>
              {strengthSection.result.aiExplanation && (
                <p className={styles.explanationBox}>{strengthSection.result.aiExplanation}</p>
              )}
            </div>
          ) : (
            <>
              <p className={styles.chartCaption}>악력·근력나이 추이</p>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart
                  data={strengthSection.points.map((p) => ({
                    day: formatShortDate(p.examDate),
                    gripAvgKg: p.gripAvgKg,
                    estimatedGripAge: p.estimatedGripAge,
                  }))}
                  margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                >
                  <CartesianGrid stroke="rgba(110, 148, 140, 0.2)" vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 12, fill: "var(--color-ink)" }} tickLine={false} />
                  <YAxis
                    yAxisId="grip"
                    tick={{ fontSize: 12, fill: "var(--color-ink)" }}
                    tickLine={false}
                    axisLine={false}
                    width={36}
                  />
                  <YAxis
                    yAxisId="age"
                    orientation="right"
                    tick={{ fontSize: 12, fill: "var(--color-ink)" }}
                    tickLine={false}
                    axisLine={false}
                    width={36}
                    tickFormatter={(v) => `${v}세`}
                  />
                  <Tooltip
                    formatter={(value, name) =>
                      name === "estimatedGripAge" ? [`${value}세`, "근력나이"] : [`${value}kg`, "악력평균"]
                    }
                  />
                  <Line
                    yAxisId="grip"
                    type="monotone"
                    dataKey="gripAvgKg"
                    name="gripAvgKg"
                    stroke="var(--color-celadon-dark)"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                  <Line
                    yAxisId="age"
                    type="monotone"
                    dataKey="estimatedGripAge"
                    name="estimatedGripAge"
                    stroke="var(--color-seal)"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    connectNulls={false}
                  />
                </LineChart>
              </ResponsiveContainer>
              {strengthSection.aiExplanation && (
                <p className={styles.explanationBox}>{strengthSection.aiExplanation}</p>
              )}
            </>
          )}
        </div>
      )}
    </PatientViewLayout>
  );
}
