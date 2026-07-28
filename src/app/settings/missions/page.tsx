"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import styles from "./page.module.css";
import BackButton from "@/components/BackButton";
import { useCurrentUserContext } from "@/lib/CurrentUserContext";

type MissionTemplate = {
  id: number;
  type: string;
  category: string;
  title: string;
  body: string;
  quizOptions: string | null;
  quizAnswerIndex: number | null;
  rewardAmount: number;
  isActive: boolean;
};

const TYPE_LABEL: Record<string, string> = { QUIZ: "퀴즈", PHOTO: "사진", TEXT: "텍스트" };
const TYPE_TABS = ["전체", "QUIZ", "PHOTO", "TEXT"];

function parseOptions(quizOptions: string | null): string[] {
  if (!quizOptions) return [];
  try {
    const parsed = JSON.parse(quizOptions);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const EMPTY_FORM = {
  type: "QUIZ",
  category: "",
  title: "",
  body: "",
  quizOptions: ["", "", "", ""],
  quizAnswerIndex: 0,
  rewardAmount: "1000",
};

/**
 * 미션뱅크 관리(/settings/missions, task.md 3-1) — 킬팻캡슐 미션톡 원본(퀴즈/사진/텍스트)
 * 생성/수정/비활성화. 유형별로 폼이 분기된다(QUIZ만 보기+정답 입력).
 */
export default function MissionsSettingsPage() {
  const { currentUser } = useCurrentUserContext();
  const isDirector = currentUser?.role === "원장";

  const [templates, setTemplates] = useState<MissionTemplate[] | null>(null);
  const [typeFilter, setTypeFilter] = useState("전체");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function loadTemplates() {
    fetch("/api/missions/templates")
      .then((res) => res.json())
      .then(setTemplates);
  }

  useEffect(() => {
    loadTemplates();
  }, []);

  const filteredTemplates = useMemo(() => {
    if (!templates) return [];
    if (typeFilter === "전체") return templates;
    return templates.filter((t) => t.type === typeFilter);
  }, [templates, typeFilter]);

  function resetForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError(null);
  }

  function startEdit(t: MissionTemplate) {
    const options = parseOptions(t.quizOptions);
    setEditingId(t.id);
    setForm({
      type: t.type,
      category: t.category,
      title: t.title,
      body: t.body,
      quizOptions: options.length > 0 ? options : ["", "", "", ""],
      quizAnswerIndex: t.quizAnswerIndex ?? 0,
      rewardAmount: String(t.rewardAmount),
    });
    setShowForm(true);
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!currentUser) return;
    setError(null);

    if (!form.category.trim() || !form.title.trim() || !form.body.trim()) {
      setError("필수 항목을 입력해주세요.");
      return;
    }
    const validOptions = form.quizOptions.map((o) => o.trim()).filter(Boolean);
    if (form.type === "QUIZ" && validOptions.length < 2) {
      setError("퀴즈는 보기를 2개 이상 입력해야 합니다.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        staffUserId: currentUser.id,
        type: form.type,
        category: form.category.trim(),
        title: form.title.trim(),
        missionBody: form.body.trim(),
        quizOptions: form.type === "QUIZ" ? validOptions : undefined,
        quizAnswerIndex: form.type === "QUIZ" ? form.quizAnswerIndex : undefined,
        rewardAmount: Number(form.rewardAmount),
      };
      const url = editingId ? `/api/missions/templates/${editingId}` : "/api/missions/templates";
      const res = await fetch(url, {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "저장에 실패했습니다.");
        return;
      }
      resetForm();
      loadTemplates();
    } catch {
      setError("서버에 연결하지 못했습니다. 다시 시도해주세요.");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(t: MissionTemplate) {
    if (!currentUser) return;
    await fetch(`/api/missions/templates/${t.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ staffUserId: currentUser.id, isActive: !t.isActive }),
    });
    loadTemplates();
  }

  return (
    <div className={styles.container}>
      <div className={styles.titleRow}>
        <BackButton />
        <h1 className={styles.pageTitle}>미션뱅크 관리</h1>
      </div>
      <p className={styles.muted}>
        킬팻캡슐 진행중 환자에게 발송할 미션(퀴즈/사진/텍스트)을 만들고 관리합니다.
      </p>

      <div className={styles.section}>
        <Link href="/settings/missions/schedule" className={styles.linkButton}>
          발송요일 설정 →
        </Link>
        <Link href="/missions/today" className={styles.linkButton}>
          오늘의 미션 발송 →
        </Link>
        <Link href="/missions/approvals" className={styles.linkButton}>
          승인 대기 큐 →
        </Link>
      </div>

      <div className={styles.section}>
        {!isDirector && <p className={styles.errorText}>원장만 미션을 등록/수정할 수 있습니다.</p>}
        {!showForm ? (
          <button
            type="button"
            className={styles.newButton}
            disabled={!isDirector}
            onClick={() => {
              setShowForm(true);
              setEditingId(null);
              setForm(EMPTY_FORM);
            }}
          >
            + 새 미션 등록
          </button>
        ) : (
          <form className={styles.formGrid} onSubmit={handleSubmit}>
            <div className={styles.sectionTitle}>{editingId ? "미션 수정" : "새 미션 등록"}</div>
            <label className={styles.fieldLabel}>
              유형
              <select
                value={form.type}
                onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
              >
                <option value="QUIZ">퀴즈</option>
                <option value="PHOTO">사진</option>
                <option value="TEXT">텍스트</option>
              </select>
            </label>
            <label className={styles.fieldLabel}>
              카테고리
              <input
                type="text"
                placeholder="예: 체중계, 공유, 후기, 약속, 다짐, 일기, 기타"
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              />
            </label>
            <label className={styles.fieldLabel}>
              제목
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              />
            </label>
            <label className={styles.fieldLabel}>
              {form.type === "QUIZ" ? "질문" : "안내 문구"}
              <textarea
                rows={3}
                value={form.body}
                onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
              />
            </label>

            {form.type === "QUIZ" && (
              <>
                <div className={styles.fieldLabel}>보기 (정답에 라디오 선택)</div>
                {form.quizOptions.map((option, index) => (
                  <div className={styles.quizOptionRow} key={index}>
                    <input
                      type="radio"
                      name="quizAnswerIndex"
                      checked={form.quizAnswerIndex === index}
                      onChange={() => setForm((f) => ({ ...f, quizAnswerIndex: index }))}
                    />
                    <input
                      type="text"
                      placeholder={`보기 ${index + 1}`}
                      value={option}
                      onChange={(e) =>
                        setForm((f) => {
                          const next = [...f.quizOptions];
                          next[index] = e.target.value;
                          return { ...f, quizOptions: next };
                        })
                      }
                    />
                  </div>
                ))}
              </>
            )}

            <label className={styles.fieldLabel}>
              적립금(원)
              <input
                type="number"
                min={0}
                value={form.rewardAmount}
                onChange={(e) => setForm((f) => ({ ...f, rewardAmount: e.target.value }))}
              />
            </label>

            {error && <p className={styles.errorText}>{error}</p>}

            <div>
              <button type="submit" disabled={!isDirector || saving}>
                {saving ? "저장 중..." : "저장"}
              </button>
              <button type="button" onClick={resetForm} style={{ marginLeft: 8, background: "transparent", color: "var(--color-ink)" }}>
                취소
              </button>
            </div>
          </form>
        )}
      </div>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>미션 목록 ({filteredTemplates.length}건)</div>
        <div className={styles.filterTabs}>
          {TYPE_TABS.map((t) => (
            <button
              key={t}
              type="button"
              className={`${styles.filterTab} ${typeFilter === t ? styles.filterTabActive : ""}`}
              onClick={() => setTypeFilter(t)}
            >
              {t === "전체" ? "전체" : TYPE_LABEL[t]}
            </button>
          ))}
        </div>

        {templates === null ? (
          <p className={styles.muted}>불러오는 중...</p>
        ) : filteredTemplates.length === 0 ? (
          <p className={styles.muted}>등록된 미션이 없습니다.</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>유형</th>
                <th>카테고리</th>
                <th>제목</th>
                <th>적립금</th>
                <th>상태</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filteredTemplates.map((t) => (
                <tr key={t.id} className={t.isActive ? "" : styles.inactiveRow}>
                  <td>{TYPE_LABEL[t.type] ?? t.type}</td>
                  <td>{t.category}</td>
                  <td>{t.title}</td>
                  <td>{t.rewardAmount.toLocaleString()}원</td>
                  <td>{t.isActive ? "활성" : "비활성"}</td>
                  <td>
                    <button type="button" className={styles.expandButton} disabled={!isDirector} onClick={() => startEdit(t)}>
                      수정
                    </button>
                    <button
                      type="button"
                      className={styles.expandButton}
                      disabled={!isDirector}
                      onClick={() => handleToggleActive(t)}
                    >
                      {t.isActive ? "비활성화" : "활성화"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
