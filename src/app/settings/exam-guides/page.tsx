"use client";

import { useEffect, useState } from "react";
import styles from "./page.module.css";
import BackButton from "@/components/BackButton";
import { useCurrentUserContext } from "@/lib/CurrentUserContext";

type TcmPatternMapEntry = { symptoms: string; pattern: string; phrase: string };

type ExamAcademicGuide = {
  examType: string;
  content: string;
  tcmPatternMapJson: string | null;
  updatedAt: string;
} | null;

function parseTcmPatternMap(json: string | null | undefined): TcmPatternMapEntry[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const EXAM_TYPE_LABEL: Record<string, string> = { HRV: "자율신경맥파기(HRV)" };

type TcmCategoryAdmin = {
  id: number;
  categoryCode: string;
  patientLabel: string;
  treatmentPrinciple: string | null;
  questions: { id: number; questionCode: string; patientQuestion: string }[];
};

/**
 * 검사종류별 학술 근거 관리 화면(task2.md) — 원장 전용. 여기 작성한 내용이 AI 해설 생성의
 * 입력재료로 그대로 쓰이므로(hrv-explanation.ts), 잘못된 내용이 환자에게 노출되지 않도록
 * 원장만 수정 가능하다(programs 등록화면과 동일한 서버단 재검증 패턴).
 */
export default function ExamGuidesSettingsPage() {
  const { currentUser } = useCurrentUserContext();
  const isDirector = currentUser?.role === "원장";

  const examType = "HRV";
  const [guide, setGuide] = useState<ExamAcademicGuide>(null);
  const [content, setContent] = useState("");
  const [tcmRows, setTcmRows] = useState<TcmPatternMapEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [categories, setCategories] = useState<TcmCategoryAdmin[] | null>(null);
  const [treatmentPrinciples, setTreatmentPrinciples] = useState<Record<number, string>>({});
  const [categorySaving, setCategorySaving] = useState(false);
  const [categorySaveError, setCategorySaveError] = useState<string | null>(null);
  const [categorySaved, setCategorySaved] = useState(false);

  useEffect(() => {
    fetch(`/api/exam-guides/${examType}`)
      .then((res) => res.json())
      .then((data: ExamAcademicGuide) => {
        setGuide(data);
        setContent(data?.content ?? "");
        setTcmRows(parseTcmPatternMap(data?.tcmPatternMapJson));
        setLoaded(true);
      });
    fetch("/api/tcm-categories")
      .then((res) => res.json())
      .then((data: TcmCategoryAdmin[]) => {
        setCategories(data);
        setTreatmentPrinciples(
          Object.fromEntries(data.map((c) => [c.id, c.treatmentPrinciple ?? ""])),
        );
      });
  }, []);

  async function handleSaveCategories() {
    if (!currentUser) return;
    setCategorySaving(true);
    setCategorySaveError(null);
    setCategorySaved(false);
    try {
      const res = await fetch("/api/tcm-categories", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          staffUserId: currentUser.id,
          categories: Object.entries(treatmentPrinciples).map(([id, treatmentPrinciple]) => ({
            id: Number(id),
            treatmentPrinciple: treatmentPrinciple.trim() ? treatmentPrinciple : null,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCategorySaveError(data.error ?? "저장에 실패했습니다.");
        return;
      }
      setCategories(data);
      setCategorySaved(true);
      setTimeout(() => setCategorySaved(false), 2000);
    } catch {
      setCategorySaveError("서버에 연결하지 못했습니다. 다시 시도해주세요.");
    } finally {
      setCategorySaving(false);
    }
  }

  function updateTcmRow(index: number, field: keyof TcmPatternMapEntry, value: string) {
    setTcmRows((rows) => rows.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
  }

  function addTcmRow() {
    setTcmRows((rows) => [...rows, { symptoms: "", pattern: "", phrase: "" }]);
  }

  function removeTcmRow(index: number) {
    setTcmRows((rows) => rows.filter((_, i) => i !== index));
  }

  async function handleSave() {
    if (!currentUser) return;
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      const validRows = tcmRows.filter((r) => r.symptoms.trim() && r.pattern.trim() && r.phrase.trim());
      const res = await fetch(`/api/exam-guides/${examType}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staffUserId: currentUser.id, content, tcmPatternMap: validRows }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSaveError(data.error ?? "저장에 실패했습니다.");
        return;
      }
      setGuide(data);
      setTcmRows(parseTcmPatternMap(data.tcmPatternMapJson));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setSaveError("서버에 연결하지 못했습니다. 다시 시도해주세요.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.titleRow}>
        <BackButton />
        <h1 className={styles.pageTitle}>검사 학술근거 관리</h1>
      </div>
      <p className={styles.muted}>
        여기 작성한 내용이 검사 결과 AI 해설 생성의 입력재료로 쓰입니다. AI는 이 내용을
        환자 친화적으로 재구성만 할 뿐, 여기 없는 새로운 의학적 효능/통계를 만들어내지
        않습니다.
      </p>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>{EXAM_TYPE_LABEL[examType]}</div>
        {!isDirector && <p className={styles.errorText}>원장만 학술 근거를 수정할 수 있습니다.</p>}

        {!loaded ? (
          <p className={styles.muted}>불러오는 중...</p>
        ) : (
          <>
            <textarea
              className={styles.contentTextarea}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              disabled={!isDirector}
              placeholder="예: 자율신경맥파기(HRV) 검사는 자율신경 균형과 혈관 탄성도를 측정하여..."
              rows={10}
            />
            <div className={styles.tcmSectionTitle}>한의학적 가능성 매핑표</div>
            <p className={styles.muted}>
              증상 키워드가 실제 환자 기록과 관련 있을 때만 AI가 참고해서 "가능성 시사" 문구로
              언급합니다 — 관련 증상이 없으면 억지로 끼워맞추지 않습니다.
            </p>
            {tcmRows.map((row, i) => (
              <div key={i} className={styles.tcmRow}>
                <input
                  type="text"
                  placeholder="증상 키워드 (예: 흉민, 한숨, 예민함)"
                  value={row.symptoms}
                  onChange={(e) => updateTcmRow(i, "symptoms", e.target.value)}
                  disabled={!isDirector}
                />
                <input
                  type="text"
                  placeholder="패턴명 (예: 간기울결)"
                  value={row.pattern}
                  onChange={(e) => updateTcmRow(i, "pattern", e.target.value)}
                  disabled={!isDirector}
                />
                <input
                  type="text"
                  placeholder="언급 문구 (예: 정서적 긴장과 기의 울체가 동반된 패턴 가능성)"
                  value={row.phrase}
                  onChange={(e) => updateTcmRow(i, "phrase", e.target.value)}
                  disabled={!isDirector}
                />
                {isDirector && (
                  <button type="button" className={styles.removeRowButton} onClick={() => removeTcmRow(i)}>
                    삭제
                  </button>
                )}
              </div>
            ))}
            {isDirector && (
              <button type="button" className={styles.addRowButton} onClick={addTcmRow}>
                + 패턴 추가
              </button>
            )}

            {guide && (
              <p className={styles.muted}>
                마지막 수정: {new Date(guide.updatedAt).toLocaleString("ko-KR")}
              </p>
            )}
            <button
              type="button"
              className={styles.saveButton}
              onClick={handleSave}
              disabled={!isDirector || saving}
            >
              {saving ? "저장 중..." : saved ? "저장됨" : "저장"}
            </button>
            {saveError && <p className={styles.errorText}>{saveError}</p>}
          </>
        )}
      </div>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>증상 패턴 프로필 — 카테고리별 치료원칙</div>
        <p className={styles.muted}>
          "상담설문"에서 환자가 체크한 카테고리별 응답을 바탕으로 AI가 HRV 코멘트에 구체적 치료
          방향을 언급할 때 참고하는 문구입니다. 카테고리명과 문항 문구는 이 화면에서 수정할 수
          없습니다(확정된 문항) — 치료원칙만 입력/수정하세요. 비워두면 AI는 해당 카테고리의
          신호만 언급하고 구체적 치료법은 언급하지 않습니다.
        </p>
        {!isDirector && <p className={styles.errorText}>원장만 치료원칙을 수정할 수 있습니다.</p>}

        {!categories ? (
          <p className={styles.muted}>불러오는 중...</p>
        ) : (
          <>
            {categories.map((c) => (
              <div key={c.id} className={styles.tcmCategoryRow}>
                <div className={styles.tcmCategoryHeader}>
                  <strong>{c.patientLabel}</strong>
                  <span className={styles.muted}> ({c.categoryCode})</span>
                </div>
                {c.questions.length > 0 && (
                  <ul className={styles.tcmQuestionList}>
                    {c.questions.map((q) => (
                      <li key={q.id}>{q.patientQuestion}</li>
                    ))}
                  </ul>
                )}
                <textarea
                  className={styles.contentTextarea}
                  rows={2}
                  placeholder="치료원칙 (예: 소간이기) — 비워두면 AI가 구체적 치료법을 언급하지 않습니다"
                  value={treatmentPrinciples[c.id] ?? ""}
                  onChange={(e) =>
                    setTreatmentPrinciples((prev) => ({ ...prev, [c.id]: e.target.value }))
                  }
                  disabled={!isDirector}
                />
              </div>
            ))}
            <button
              type="button"
              className={styles.saveButton}
              onClick={handleSaveCategories}
              disabled={!isDirector || categorySaving}
            >
              {categorySaving ? "저장 중..." : categorySaved ? "저장됨" : "저장"}
            </button>
            {categorySaveError && <p className={styles.errorText}>{categorySaveError}</p>}
          </>
        )}
      </div>
    </div>
  );
}
