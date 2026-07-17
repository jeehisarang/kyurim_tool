"use client";

import { useState } from "react";
import styles from "./ConsultationSurveyShareSection.module.css";
import type { ShareLinkConsultationSurveyView } from "@/lib/share-links";

type CategoryWithQuestions = {
  id: number;
  patientLabel: string;
  questions: { id: number; patientQuestion: string }[];
};

type LatestResponse = {
  otherSymptomsText: string | null;
} | null;

const SCORE_LABEL: Record<0 | 1 | 2, string> = { 0: "없다", 1: "경미하다", 2: "심하다" };

/**
 * 공유링크(/s/{token}) 4번째 섹션 "상담설문"(task.md) — 응답이 있으면 3단계 요약을 항상
 * 보여주고(자동 노출, task2.md 결정사항 2), 환자가 직접 작성/재작성할 수 있는 폼도 함께
 * 제공한다(비인증 제출, /api/share-links/{token}/consultation-survey).
 */
export default function ConsultationSurveyShareSection({
  token,
  summary,
}: {
  token: string;
  summary: ShareLinkConsultationSurveyView;
}) {
  const [formOpen, setFormOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState<CategoryWithQuestions[] | null>(null);
  const [otherCategory, setOtherCategory] = useState<CategoryWithQuestions | null>(null);
  const [answers, setAnswers] = useState<Record<number, 0 | 1 | 2>>({});
  const [otherSymptomsText, setOtherSymptomsText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  function openForm() {
    setFormOpen(true);
    if (categories) return;
    setLoading(true);
    fetch(`/api/share-links/${token}/consultation-survey`)
      .then((res) => res.json())
      .then((data: { categories: CategoryWithQuestions[]; latestResponse: LatestResponse; answers: Record<string, 0 | 1 | 2> }) => {
        setCategories(data.categories.filter((c) => c.questions.length > 0));
        setOtherCategory(data.categories.find((c) => c.questions.length === 0) ?? null);
        setOtherSymptomsText(data.latestResponse?.otherSymptomsText ?? "");
        setAnswers(Object.fromEntries(Object.entries(data.answers).map(([qId, score]) => [Number(qId), score])));
      })
      .finally(() => setLoading(false));
  }

  async function handleSubmit() {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch(`/api/share-links/${token}/consultation-survey`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          otherSymptomsText,
          answers: Object.entries(answers).map(([questionId, score]) => ({ questionId: Number(questionId), score })),
        }),
      });
      if (!res.ok) {
        setSubmitError("저장에 실패했습니다. 다시 시도해주세요.");
        return;
      }
      setSubmitted(true);
    } catch {
      setSubmitError("서버에 연결하지 못했습니다. 다시 시도해주세요.");
    } finally {
      setSubmitting(false);
    }
  }

  const allAnswered =
    categories !== null && categories.length > 0 && categories.every((c) => c.questions.every((q) => answers[q.id] !== undefined));

  return (
    <div className={styles.section}>
      <p className={styles.title}>상담설문 (참고용 증상 프로필)</p>
      {summary.candidateLabels.length > 0 ? (
        <p>관련 증상이 확인됩니다: <strong>{summary.candidateLabels.join(", ")}</strong></p>
      ) : (
        <p className={styles.muted}>특이 증상 확인되지 않음</p>
      )}
      <ul className={styles.tierList}>
        {summary.tiers.map((t) => (
          <li key={t.patientLabel}>
            {t.patientLabel}: {t.tierLabel}
          </li>
        ))}
      </ul>

      {submitted ? (
        <p className={styles.muted}>응답이 저장되었습니다. 감사합니다.</p>
      ) : !formOpen ? (
        <button type="button" className={styles.openButton} onClick={openForm}>
          설문 다시 작성하기
        </button>
      ) : (
        <div className={styles.form}>
          {loading && <p className={styles.muted}>불러오는 중...</p>}
          {categories?.map((c) => (
            <div key={c.id} className={styles.categoryBlock}>
              <div className={styles.categoryTitle}>{c.patientLabel}</div>
              {c.questions.map((q) => (
                <div key={q.id} className={styles.questionRow}>
                  <span>{q.patientQuestion}</span>
                  <div className={styles.scoreOptions}>
                    {([0, 1, 2] as const).map((score) => (
                      <label key={score} className={styles.scoreOption}>
                        <input
                          type="radio"
                          name={`q-${q.id}`}
                          checked={answers[q.id] === score}
                          onChange={() => setAnswers((prev) => ({ ...prev, [q.id]: score }))}
                        />
                        {SCORE_LABEL[score]}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ))}
          {otherCategory && (
            <div className={styles.categoryBlock}>
              <div className={styles.categoryTitle}>{otherCategory.patientLabel}</div>
              <textarea
                className={styles.otherTextarea}
                rows={2}
                placeholder="위 항목에 없는 증상이 있으면 자유롭게 적어주세요"
                value={otherSymptomsText}
                onChange={(e) => setOtherSymptomsText(e.target.value)}
              />
            </div>
          )}
          {categories && (
            <button type="button" className={styles.submitButton} onClick={handleSubmit} disabled={!allAnswered || submitting}>
              {submitting ? "저장 중..." : "저장"}
            </button>
          )}
          {submitError && <p className={styles.errorText}>{submitError}</p>}
        </div>
      )}
    </div>
  );
}
