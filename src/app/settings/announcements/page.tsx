"use client";

import { useEffect, useState } from "react";
import styles from "./page.module.css";
import BackButton from "@/components/BackButton";
import { getCurrentUserId } from "@/lib/currentUser";

type Announcement = {
  id: number;
  title: string;
  content: string;
  startDate: string;
  endDate: string | null;
  isActive: boolean;
  createdBy: { id: number; name: string };
};

function toDateInputValue(iso: string): string {
  return iso.slice(0, 10);
}

function formatPeriod(a: Announcement): string {
  const start = toDateInputValue(a.startDate);
  const end = a.endDate ? toDateInputValue(a.endDate) : "무기한";
  return `${start} ~ ${end}`;
}

export default function AnnouncementSettingsPage() {
  const [announcements, setAnnouncements] = useState<Announcement[] | null>(null);

  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newStartDate, setNewStartDate] = useState(() => toDateInputValue(new Date().toISOString()));
  const [newEndDate, setNewEndDate] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editStartDate, setEditStartDate] = useState("");
  const [editEndDate, setEditEndDate] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  useEffect(() => {
    refresh();
  }, []);

  function refresh() {
    fetch("/api/announcements")
      .then((res) => res.json())
      .then(setAnnouncements);
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setAddError(null);
    const createdById = getCurrentUserId();
    if (!createdById) {
      setAddError("상단에서 현재 사용자를 먼저 선택하세요.");
      return;
    }
    setAdding(true);
    try {
      const res = await fetch("/api/announcements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newTitle,
          content: newContent,
          startDate: newStartDate,
          endDate: newEndDate || undefined,
          createdById,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAddError(data.error ?? "공지 등록에 실패했습니다.");
        return;
      }
      setNewTitle("");
      setNewContent("");
      setNewStartDate(toDateInputValue(new Date().toISOString()));
      setNewEndDate("");
      refresh();
    } catch {
      setAddError("서버에 연결하지 못했습니다. 다시 시도해주세요.");
    } finally {
      setAdding(false);
    }
  }

  function startEdit(a: Announcement) {
    setEditingId(a.id);
    setEditTitle(a.title);
    setEditContent(a.content);
    setEditStartDate(toDateInputValue(a.startDate));
    setEditEndDate(a.endDate ? toDateInputValue(a.endDate) : "");
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
      const res = await fetch(`/api/announcements/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editTitle,
          content: editContent,
          startDate: editStartDate,
          endDate: editEndDate || null,
        }),
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

  async function toggleActive(a: Announcement) {
    const action = a.isActive ? "내리시겠습니까" : "다시 올리시겠습니까";
    if (!window.confirm(`이 공지를 ${action}?`)) return;
    try {
      const res = await fetch(`/api/announcements/${a.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !a.isActive }),
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

  async function handleDelete(a: Announcement) {
    if (!window.confirm("이 공지사항을 삭제하시겠습니까?")) return;
    try {
      const res = await fetch(`/api/announcements/${a.id}`, { method: "DELETE" });
      if (!res.ok) {
        alert("삭제에 실패했습니다. 다시 시도해주세요.");
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
        <h1 className={styles.pageTitle}>공지사항 관리</h1>
      </div>
      <p className={styles.muted}>
        휴진 안내, 유의사항, 이벤트 기간 안내 등 상시 안내용 게시물입니다. 완료/체크 개념이
        없으며, 조건에 맞으면 홈 화면 상단에 그대로 노출됩니다.
      </p>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>신규 공지 등록</div>
        <form className={styles.form} onSubmit={handleAdd}>
          <input
            type="text"
            placeholder="제목"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
          />
          <textarea
            placeholder="내용"
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
          />
          <div className={styles.dateRow}>
            <label>
              시작일
              <input
                type="date"
                value={newStartDate}
                onChange={(e) => setNewStartDate(e.target.value)}
              />
            </label>
            <label>
              종료일 (비우면 무기한)
              <input
                type="date"
                value={newEndDate}
                onChange={(e) => setNewEndDate(e.target.value)}
              />
            </label>
          </div>
          <button type="submit" className={styles.submitButton} disabled={adding}>
            등록
          </button>
          {addError && <p className={styles.errorText}>{addError}</p>}
        </form>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>공지 목록 ({announcements?.length ?? 0}건)</div>
        {announcements === null ? (
          <p className={styles.muted}>불러오는 중...</p>
        ) : announcements.length === 0 ? (
          <p className={styles.muted}>등록된 공지사항이 없습니다.</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>제목</th>
                <th>기간</th>
                <th>상태</th>
                <th>작성자</th>
                <th>관리</th>
              </tr>
            </thead>
            <tbody>
              {announcements.map((a) => (
                <tr key={a.id} className={a.isActive ? undefined : styles.inactiveRow}>
                  {editingId === a.id ? (
                    <>
                      <td>
                        <input
                          className={styles.inlineInput}
                          type="text"
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                        />
                        <textarea
                          className={styles.inlineInput}
                          value={editContent}
                          onChange={(e) => setEditContent(e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          className={styles.inlineInput}
                          type="date"
                          value={editStartDate}
                          onChange={(e) => setEditStartDate(e.target.value)}
                        />
                        <input
                          className={styles.inlineInput}
                          type="date"
                          value={editEndDate}
                          onChange={(e) => setEditEndDate(e.target.value)}
                        />
                      </td>
                      <td>{a.isActive ? "활성" : "비활성"}</td>
                      <td>{a.createdBy.name}</td>
                      <td>
                        <span className={styles.rowActions}>
                          <button
                            type="button"
                            className={styles.editButton}
                            onClick={() => saveEdit(a.id)}
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
                      <td>
                        <div>{a.title}</div>
                        <div className={styles.muted}>{a.content}</div>
                      </td>
                      <td>{formatPeriod(a)}</td>
                      <td>
                        <span className={a.isActive ? styles.statusActive : styles.statusInactive}>
                          {a.isActive ? "활성" : "비활성"}
                        </span>
                      </td>
                      <td>{a.createdBy.name}</td>
                      <td>
                        <span className={styles.rowActions}>
                          <button
                            type="button"
                            className={styles.editButton}
                            onClick={() => startEdit(a)}
                          >
                            수정
                          </button>
                          <button
                            type="button"
                            className={a.isActive ? styles.deactivateButton : styles.activateButton}
                            onClick={() => toggleActive(a)}
                          >
                            {a.isActive ? "내리기" : "다시 올리기"}
                          </button>
                          <button
                            type="button"
                            className={styles.deleteButton}
                            onClick={() => handleDelete(a)}
                          >
                            삭제
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
