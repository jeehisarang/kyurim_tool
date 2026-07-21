"use client";

import { useEffect, useState } from "react";
import styles from "./page.module.css";
import BackButton from "@/components/BackButton";
import { useCurrentUserContext } from "@/lib/CurrentUserContext";

type TcmQuestion = {
  id: number;
  questionCode: string;
  patientQuestion: string;
  displayOrder: number;
};

type TcmCategoryWithQuestions = {
  id: number;
  categoryCode: string;
  patientLabel: string;
  questions: TcmQuestion[];
};

/**
 * 증상 패턴 체크리스트 "질문 관리" 화면(task.md) — 원장 전용. 카테고리(7개, 고정) 안의
 * 질문만 추가/수정/삭제할 수 있다. 여기서 추가한 질문은 상담설문/검사등록/상담모드 3개
 * 입력 경로와 건강 리포트 카드2에 별도 코드 수정 없이 자동 반영된다(listActiveCategoriesWithQuestions
 * 를 세 경로가 공유하기 때문).
 */
export default function TcmChecklistQuestionsSettingsPage() {
  const { currentUser } = useCurrentUserContext();
  const isDirector = currentUser?.role === "원장";

  const [categories, setCategories] = useState<TcmCategoryWithQuestions[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [newQuestionText, setNewQuestionText] = useState<Record<number, string>>({});
  const [addingCategoryId, setAddingCategoryId] = useState<number | null>(null);

  const [editingQuestionId, setEditingQuestionId] = useState<number | null>(null);
  const [editingText, setEditingText] = useState("");
  const [savingQuestionId, setSavingQuestionId] = useState<number | null>(null);

  const [deletingQuestionId, setDeletingQuestionId] = useState<number | null>(null);

  function loadCategories() {
    fetch("/api/tcm-checklist-questions")
      .then((res) => res.json())
      .then((data: TcmCategoryWithQuestions[]) => setCategories(data));
  }

  useEffect(() => {
    loadCategories();
  }, []);

  async function handleAddQuestion(categoryId: number) {
    if (!currentUser) return;
    const text = (newQuestionText[categoryId] ?? "").trim();
    if (!text) return;

    setAddingCategoryId(categoryId);
    setError(null);
    try {
      const res = await fetch("/api/tcm-checklist-questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staffUserId: currentUser.id, categoryId, patientQuestion: text }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "질문 추가에 실패했습니다.");
        return;
      }
      setCategories(data);
      setNewQuestionText((prev) => ({ ...prev, [categoryId]: "" }));
    } catch {
      setError("서버에 연결하지 못했습니다. 다시 시도해주세요.");
    } finally {
      setAddingCategoryId(null);
    }
  }

  function startEdit(question: TcmQuestion) {
    setEditingQuestionId(question.id);
    setEditingText(question.patientQuestion);
    setError(null);
  }

  function cancelEdit() {
    setEditingQuestionId(null);
    setEditingText("");
  }

  async function handleSaveEdit(questionId: number) {
    if (!currentUser) return;
    const text = editingText.trim();
    if (!text) return;

    setSavingQuestionId(questionId);
    setError(null);
    try {
      const res = await fetch("/api/tcm-checklist-questions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staffUserId: currentUser.id, questionId, patientQuestion: text }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "질문 수정에 실패했습니다.");
        return;
      }
      setCategories(data);
      cancelEdit();
    } catch {
      setError("서버에 연결하지 못했습니다. 다시 시도해주세요.");
    } finally {
      setSavingQuestionId(null);
    }
  }

  async function handleDelete(question: TcmQuestion) {
    if (!currentUser) return;
    if (!window.confirm(`"${question.patientQuestion}" 질문을 삭제하시겠습니까?`)) return;

    setDeletingQuestionId(question.id);
    setError(null);
    try {
      const res = await fetch("/api/tcm-checklist-questions", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staffUserId: currentUser.id, questionId: question.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "질문 삭제에 실패했습니다.");
        return;
      }
      setCategories(data);
      if (editingQuestionId === question.id) cancelEdit();
    } catch {
      setError("서버에 연결하지 못했습니다. 다시 시도해주세요.");
    } finally {
      setDeletingQuestionId(null);
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.titleRow}>
        <BackButton />
        <h1 className={styles.pageTitle}>증상 패턴 체크리스트 질문 관리</h1>
      </div>
      <p className={styles.muted}>
        카테고리(7개) 안의 질문을 추가/수정/삭제합니다. 여기서 바뀐 내용은 상담설문/검사등록/
        상담모드 3개 입력 경로와 건강 리포트에 자동 반영됩니다. 카테고리 자체 추가/삭제/
        이름변경과 질문 순서 조정(드래그)은 이 화면의 범위 밖입니다 — 새 질문은 항상 카테고리
        맨 끝에 추가됩니다. 질문 삭제는 소프트 삭제입니다(과거 응답에 이미 연결된 질문이라
        완전히 지우면 과거 건강 리포트가 깨질 수 있어, 실제로는 비활성화만 되고 새 체크리스트
        에서만 사라집니다).
      </p>

      {!isDirector && <p className={styles.errorText}>원장만 질문을 추가/수정/삭제할 수 있습니다.</p>}
      {error && <p className={styles.errorText}>{error}</p>}

      {!categories ? (
        <p className={styles.muted}>불러오는 중...</p>
      ) : (
        categories.map((category) => (
          <div key={category.id} className={styles.section}>
            <div className={styles.sectionTitle}>{category.patientLabel}</div>

            {category.questions.length === 0 ? (
              <p className={styles.muted}>등록된 질문이 없습니다.</p>
            ) : (
              <ul className={styles.questionList}>
                {category.questions.map((q) => (
                  <li key={q.id} className={styles.questionItem}>
                    {editingQuestionId === q.id ? (
                      <div className={styles.editRow}>
                        <input
                          type="text"
                          className={styles.questionInput}
                          value={editingText}
                          onChange={(e) => setEditingText(e.target.value)}
                          maxLength={200}
                          autoFocus
                        />
                        <button
                          type="button"
                          className={styles.saveButton}
                          onClick={() => handleSaveEdit(q.id)}
                          disabled={savingQuestionId === q.id || !editingText.trim()}
                        >
                          {savingQuestionId === q.id ? "저장 중..." : "저장"}
                        </button>
                        <button type="button" className={styles.cancelButton} onClick={cancelEdit}>
                          취소
                        </button>
                      </div>
                    ) : (
                      <div className={styles.viewRow}>
                        <span
                          className={styles.questionText}
                          onClick={() => isDirector && startEdit(q)}
                          title={isDirector ? "클릭해서 수정" : undefined}
                        >
                          {q.patientQuestion}
                        </span>
                        {isDirector && (
                          <button
                            type="button"
                            className={styles.removeRowButton}
                            onClick={() => handleDelete(q)}
                            disabled={deletingQuestionId === q.id}
                          >
                            {deletingQuestionId === q.id ? "삭제 중..." : "삭제"}
                          </button>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {isDirector && (
              <div className={styles.addRow}>
                <input
                  type="text"
                  className={styles.questionInput}
                  placeholder="새 질문 문구를 입력하세요"
                  value={newQuestionText[category.id] ?? ""}
                  onChange={(e) => setNewQuestionText((prev) => ({ ...prev, [category.id]: e.target.value }))}
                  maxLength={200}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAddQuestion(category.id);
                  }}
                />
                <button
                  type="button"
                  className={styles.addRowButton}
                  onClick={() => handleAddQuestion(category.id)}
                  disabled={addingCategoryId === category.id || !(newQuestionText[category.id] ?? "").trim()}
                >
                  {addingCategoryId === category.id ? "추가 중..." : "질문 추가"}
                </button>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}
