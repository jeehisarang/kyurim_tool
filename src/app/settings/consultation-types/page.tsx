"use client";

import { useEffect, useState } from "react";
import styles from "./page.module.css";
import BackButton from "@/components/BackButton";

type ConsultationType = {
  id: number;
  name: string;
  isActive: boolean;
  sortOrder: number;
};

export default function ConsultationTypeSettingsPage() {
  const [types, setTypes] = useState<ConsultationType[] | null>(null);

  const [newName, setNewName] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editSortOrder, setEditSortOrder] = useState(0);
  const [editError, setEditError] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  useEffect(() => {
    refresh();
  }, []);

  function refresh() {
    fetch("/api/consultation-types")
      .then((res) => res.json())
      .then(setTypes);
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setAddError(null);
    if (!newName.trim()) {
      setAddError("이름을 입력하세요.");
      return;
    }
    setAdding(true);
    try {
      const nextSortOrder = types ? types.length : 0;
      const res = await fetch("/api/consultation-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), sortOrder: nextSortOrder }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAddError(data.error ?? "상담유형 추가에 실패했습니다.");
        return;
      }
      setNewName("");
      refresh();
    } catch {
      setAddError("서버에 연결하지 못했습니다. 다시 시도해주세요.");
    } finally {
      setAdding(false);
    }
  }

  function startEdit(t: ConsultationType) {
    setEditingId(t.id);
    setEditName(t.name);
    setEditSortOrder(t.sortOrder);
    setEditError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditError(null);
  }

  async function saveEdit(id: number) {
    setEditSaving(true);
    setEditError(null);
    try {
      const res = await fetch(`/api/consultation-types/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName, sortOrder: editSortOrder }),
      });
      const data = await res.json();
      if (!res.ok) {
        setEditError(data.error ?? "수정에 실패했습니다.");
        return;
      }
      setEditingId(null);
      refresh();
    } catch {
      setEditError("서버에 연결하지 못했습니다. 다시 시도해주세요.");
    } finally {
      setEditSaving(false);
    }
  }

  async function toggleActive(t: ConsultationType) {
    const action = t.isActive ? "비활성화" : "재활성화";
    if (!window.confirm(`"${t.name}" 상담유형을 ${action}하시겠습니까?`)) return;
    try {
      const res = await fetch(`/api/consultation-types/${t.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !t.isActive }),
      });
      if (!res.ok) {
        alert("처리에 실패했습니다. 다시 시도해주세요.");
        return;
      }
      refresh();
    } catch {
      alert("서버에 연결하지 못했습니다. 다시 시도해주세요.");
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.titleRow}>
        <BackButton />
        <h1 className={styles.pageTitle}>상담유형 관리</h1>
      </div>
      <p className={styles.muted}>
        원장 상담모드(/consult-mode)에서 상담 기록 시 선택하는 유형 목록입니다. 진료분야/
        진료구분과 동일한 방식으로 자유롭게 추가/수정/비활성화할 수 있습니다.
      </p>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>신규 상담유형 추가</div>
        <form className={styles.row} onSubmit={handleAdd}>
          <input
            type="text"
            placeholder="이름 (예: 추나상담)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <button type="submit" disabled={adding}>
            추가
          </button>
        </form>
        {addError && <p className={styles.errorText}>{addError}</p>}
      </div>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>상담유형 목록 ({types?.length ?? 0}건)</div>
        {types === null ? (
          <p className={styles.muted}>불러오는 중...</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>이름</th>
                <th>순서</th>
                <th>상태</th>
                <th>관리</th>
              </tr>
            </thead>
            <tbody>
              {types.map((t) => (
                <tr key={t.id} className={t.isActive ? undefined : styles.inactiveRow}>
                  {editingId === t.id ? (
                    <>
                      <td>
                        <input
                          className={styles.inlineInput}
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          className={styles.inlineInput}
                          type="number"
                          value={editSortOrder}
                          onChange={(e) => setEditSortOrder(Number(e.target.value))}
                        />
                      </td>
                      <td>{t.isActive ? "활성" : "비활성"}</td>
                      <td>
                        <span className={styles.rowActions}>
                          <button
                            type="button"
                            className={styles.editButton}
                            onClick={() => saveEdit(t.id)}
                            disabled={editSaving}
                          >
                            저장
                          </button>
                          <button type="button" className={styles.editButton} onClick={cancelEdit}>
                            취소
                          </button>
                        </span>
                        {editError && <p className={styles.errorText}>{editError}</p>}
                      </td>
                    </>
                  ) : (
                    <>
                      <td>{t.name}</td>
                      <td>{t.sortOrder}</td>
                      <td>
                        <span className={t.isActive ? styles.statusActive : styles.statusInactive}>
                          {t.isActive ? "활성" : "비활성"}
                        </span>
                      </td>
                      <td>
                        <span className={styles.rowActions}>
                          <button type="button" className={styles.editButton} onClick={() => startEdit(t)}>
                            수정
                          </button>
                          <button
                            type="button"
                            className={t.isActive ? styles.deactivateButton : styles.activateButton}
                            onClick={() => toggleActive(t)}
                          >
                            {t.isActive ? "비활성화" : "재활성화"}
                          </button>
                        </span>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
