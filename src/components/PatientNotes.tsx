"use client";

import { useEffect, useState } from "react";
import styles from "./PatientNotes.module.css";
import { getCurrentUserId } from "@/lib/currentUser";

type StaffUser = { id: number; name: string; role: string };
type PatientNote = {
  id: number;
  content: string;
  staffUser: StaffUser;
  createdAt: string;
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export default function PatientNotes({ patientId }: { patientId: number }) {
  const [notes, setNotes] = useState<PatientNote[] | null>(null);
  const [newContent, setNewContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    refresh();
  }, [patientId]);

  function refresh() {
    fetch(`/api/patient-notes?patientId=${patientId}`)
      .then((res) => res.json())
      .then(setNotes);
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newContent.trim()) return;
    const staffUserId = getCurrentUserId();
    if (!staffUserId) {
      setError("상단에서 현재 사용자를 먼저 선택하세요.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await fetch("/api/patient-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientId, content: newContent.trim(), staffUserId }),
      });
      setNewContent("");
      refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.container}>
      {notes === null ? (
        <p className={styles.muted}>메모 불러오는 중...</p>
      ) : notes.length === 0 ? (
        <p className={styles.muted}>남겨진 메모가 없습니다.</p>
      ) : (
        <ul className={styles.list}>
          {notes.map((note) => (
            <li key={note.id} className={styles.item}>
              <span className={styles.itemMeta}>
                {note.staffUser.name} · {formatDate(note.createdAt)}
              </span>
              <span className={styles.itemContent}>{note.content}</span>
            </li>
          ))}
        </ul>
      )}

      <form className={styles.form} onSubmit={handleAdd}>
        <input
          type="text"
          placeholder="생각날 때 한 줄 메모 (예: 무릎 통증 호소)"
          value={newContent}
          onChange={(e) => setNewContent(e.target.value)}
        />
        <button type="submit" disabled={submitting || !newContent.trim()}>
          메모 추가
        </button>
      </form>
      {error && <p className={styles.errorText}>{error}</p>}
    </div>
  );
}
