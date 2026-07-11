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
  | { kind: "trend"; points: { examDate: string; weightKg: number; bodyFatPercent: number }[] };

type StrengthSection =
  | { kind: "none" }
  | { kind: "single"; result: PatientSafeStrengthTest }
  | {
      kind: "trend";
      points: { examDate: string; gripAvgKg: number; estimatedGripAge: number | null }[];
    };

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

        // "1건뿐" 케이스만 상세 API를 추가로 불러와 좌/우 악력 등 목록 API에 없는
        // 필드까지 포함한 화이트리스트 뷰로 변환한다(patient-view.ts 주석 참고).
        const [bodyDetail, strengthDetail] = await Promise.all([
          plan.bodyComposition.kind === "single"
            ? fetch(`/api/examinations/BODY_COMPOSITION/${plan.bodyComposition.id}`).then((r) =>
                r.ok ? r.json() : null,
              )
            : null,
          plan.strengthTest.kind === "single"
            ? fetch(`/api/examinations/STRENGTH_TEST/${plan.strengthTest.id}`).then((r) =>
                r.ok ? r.json() : null,
              )
            : null,
        ]);

        if (cancelled) return;

        setPatientName(patient.name);

        if (plan.bodyComposition.kind === "none") {
          setBodySection({ kind: "none" });
        } else if (plan.bodyComposition.kind === "single" && bodyDetail) {
          setBodySection({
            kind: "single",
            result: toPatientSafeExamView(bodyDetail) as PatientSafeBodyComposition,
          });
        } else if (plan.bodyComposition.kind === "trend") {
          setBodySection({ kind: "trend", points: plan.bodyComposition.points });
        } else {
          setBodySection({ kind: "none" });
        }

        if (plan.strengthTest.kind === "none") {
          setStrengthSection({ kind: "none" });
        } else if (plan.strengthTest.kind === "single" && strengthDetail) {
          setStrengthSection({
            kind: "single",
            result: toPatientSafeExamView(strengthDetail) as PatientSafeStrengthTest,
          });
        } else if (plan.strengthTest.kind === "trend") {
          setStrengthSection({ kind: "trend", points: plan.strengthTest.points });
        } else {
          setStrengthSection({ kind: "none" });
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
            </>
          )}
        </div>
      )}
    </PatientViewLayout>
  );
}
