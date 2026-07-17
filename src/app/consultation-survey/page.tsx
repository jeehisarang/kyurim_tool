"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import styles from "./page.module.css";
import BackButton from "@/components/BackButton";
import { getCurrentUserId } from "@/lib/currentUser";

type Patient = { id: number; chartNumber: string; name: string };

type CategoryWithQuestions = {
  id: number;
  categoryCode: string;
  patientLabel: string;
  questions: { id: number; questionCode: string; patientQuestion: string }[];
};

type CategoryScoreView = {
  categoryId: number;
  categoryCode: string;
  patientLabel: string;
  treatmentPrinciple: string | null;
  tierLabel: "낮음" | "보통" | "뚜렷함";
  isCandidate: boolean;
};

type LatestResponse = {
  id: number;
  otherSymptomsText: string | null;
  createdAt: string;
  updatedAt: string;
  categoryScores: CategoryScoreView[];
} | null;

type HistoryEntry = { id: number; createdAt: string; source: string; candidateLabels: string[] };

const SCORE_LABEL: Record<0 | 1 | 2, string> = { 0: "없다", 1: "경미하다", 2: "심하다" };

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function ConsultationSurveyPage() {
  return (
    <Suspense fallback={<div className={styles.container}><p className={styles.muted}>불러오는 중...</p></div>}>
      <ConsultationSurveyPageInner />
    </Suspense>
  );
}

function ConsultationSurveyPageInner() {
  const searchParams = useSearchParams();
  const prefillPatientId = searchParams.get("patientId");

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Patient[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [prefillLoading, setPrefillLoading] = useState(false);

  const [categories, setCategories] = useState<CategoryWithQuestions[] | null>(null);
  const [latestResponse, setLatestResponse] = useState<LatestResponse>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [answers, setAnswers] = useState<Record<number, 0 | 1 | 2>>({});
  const [otherSymptomsText, setOtherSymptomsText] = useState("");
  const [loadingSurvey, setLoadingSurvey] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!prefillPatientId) return;
    setPrefillLoading(true);
    fetch(`/api/patients/${prefillPatientId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((patient: Patient | null) => {
        if (patient) setSelectedPatient(patient);
      })
      .finally(() => setPrefillLoading(false));
  }, [prefillPatientId]);

  function loadSurvey(patientId: number) {
    setLoadingSurvey(true);
    fetch(`/api/consultation-survey?patientId=${patientId}`)
      .then((res) => res.json())
      .then((data: { categories: CategoryWithQuestions[]; latestResponse: LatestResponse; answers: Record<string, 0 | 1 | 2>; history: HistoryEntry[] }) => {
        setCategories(data.categories);
        setLatestResponse(data.latestResponse);
        setHistory(data.history);
        setOtherSymptomsText(data.latestResponse?.otherSymptomsText ?? "");
        setAnswers(Object.fromEntries(Object.entries(data.answers).map(([qId, score]) => [Number(qId), score])));
      })
      .finally(() => setLoadingSurvey(false));
  }

  useEffect(() => {
    if (selectedPatient) loadSurvey(selectedPatient.id);
  }, [selectedPatient]);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    try {
      const res = await fetch(`/api/patients?q=${encodeURIComponent(query.trim())}`);
      setResults(await res.json());
    } finally {
      setSearching(false);
    }
  }

  function resetPatient() {
    setSelectedPatient(null);
    setResults(null);
    setQuery("");
    setCategories(null);
    setLatestResponse(null);
    setHistory([]);
    setAnswers({});
    setOtherSymptomsText("");
  }

  async function handleSubmit() {
    if (!selectedPatient) return;
    const staffUserId = getCurrentUserId();
    if (!staffUserId) {
      setSubmitError("상단에서 현재 사용자를 먼저 선택하세요.");
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/consultation-survey", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId: selectedPatient.id,
          staffUserId,
          otherSymptomsText,
          answers: Object.entries(answers).map(([questionId, score]) => ({ questionId: Number(questionId), score })),
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setSubmitError(data.error ?? "저장에 실패했습니다.");
        return;
      }
      loadSurvey(selectedPatient.id);
    } catch {
      setSubmitError("서버에 연결하지 못했습니다. 다시 시도해주세요.");
    } finally {
      setSubmitting(false);
    }
  }

  const scoredCategories = categories?.filter((c) => c.questions.length > 0) ?? [];
  const otherCategory = categories?.find((c) => c.questions.length === 0);
  const allAnswered =
    scoredCategories.length > 0 &&
    scoredCategories.every((c) => c.questions.every((q) => answers[q.id] !== undefined));

  const candidateLabels = latestResponse?.categoryScores.filter((s) => s.isCandidate).map((s) => s.patientLabel) ?? [];

  return (
    <div className={styles.container}>
      <div className={styles.pageHeader}>
        <div className={styles.titleGroup}>
          <BackButton />
          <h1 className={styles.pageTitle}>상담설문 — 증상 패턴 프로필</h1>
        </div>
      </div>
      <p className={styles.muted}>
        검사와 별개로 환자에게 종속되는 참고용 증상 체크리스트입니다. 월 1회 정도 갱신을
        권장하며, 최신 응답이 AI 검사 코멘트 생성 시 참고 자료로 함께 쓰입니다.
      </p>

      {!selectedPatient && (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>환자 검색</div>
          {prefillLoading && <p className={styles.muted}>환자 정보를 불러오는 중...</p>}
          <form className={styles.searchRow} onSubmit={handleSearch}>
            <input
              type="text"
              className={styles.searchInput}
              placeholder="차트번호 또는 이름"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button type="submit" className={styles.smallButton} disabled={searching}>
              검색
            </button>
          </form>
          {results !== null && results.length > 0 && (
            <ul className={styles.resultList}>
              {results.map((p) => (
                <li key={p.id} onClick={() => setSelectedPatient(p)}>
                  {p.name} (<span className={styles.mono}>{p.chartNumber}</span>)
                </li>
              ))}
            </ul>
          )}
          {results !== null && results.length === 0 && <p className={styles.muted}>검색 결과가 없습니다.</p>}
        </div>
      )}

      {selectedPatient && (
        <>
          <div className={styles.section}>
            <span className={styles.selectedPatient}>
              선택된 환자: <strong>{selectedPatient.name}</strong> (
              <span className={styles.mono}>{selectedPatient.chartNumber}</span>)
            </span>
            <button type="button" className={styles.smallButton} onClick={resetPatient}>
              다른 환자 선택
            </button>
          </div>

          {loadingSurvey && <p className={styles.muted}>불러오는 중...</p>}

          {!loadingSurvey && categories && (
            <>
              {latestResponse && (
                <div className={styles.section}>
                  <div className={styles.sectionTitle}>
                    현재 프로필 (최근 응답: {formatDateTime(latestResponse.updatedAt)})
                  </div>
                  {candidateLabels.length > 0 ? (
                    <p>관련 증상이 확인됩니다: <strong>{candidateLabels.join(", ")}</strong></p>
                  ) : (
                    <p className={styles.muted}>특이 증상 확인되지 않음</p>
                  )}
                  <ul className={styles.tierList}>
                    {latestResponse.categoryScores.map((s) => (
                      <li key={s.categoryId}>
                        {s.patientLabel}: {s.tierLabel}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className={styles.section}>
                <div className={styles.sectionTitle}>문항 응답</div>
                {scoredCategories.map((c) => (
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
                      rows={3}
                      placeholder="위 항목에 없는 증상이 있으면 자유롭게 적어주세요"
                      value={otherSymptomsText}
                      onChange={(e) => setOtherSymptomsText(e.target.value)}
                    />
                  </div>
                )}

                <button
                  type="button"
                  className={styles.submitButton}
                  onClick={handleSubmit}
                  disabled={!allAnswered || submitting}
                >
                  {submitting ? "저장 중..." : "저장"}
                </button>
                {!allAnswered && <p className={styles.muted}>모든 문항에 응답해야 저장할 수 있습니다.</p>}
                {submitError && <p className={styles.errorText}>{submitError}</p>}
              </div>

              {history.length > 0 && (
                <div className={styles.section}>
                  <div className={styles.sectionTitle}>이력</div>
                  <ul className={styles.historyList}>
                    {history.map((h) => (
                      <li key={h.id}>
                        {formatDateTime(h.createdAt)} — {h.candidateLabels.length > 0 ? h.candidateLabels.join(", ") : "특이 증상 확인되지 않음"}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
