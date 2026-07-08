"use client";

import { useEffect, useState } from "react";
import styles from "./page.module.css";

type StaffUser = { id: number; name: string; role: string; isActive: boolean };

const ROLES = ["원장", "직원"];

export default function StaffSettingsPage() {
  const [staffUsers, setStaffUsers] = useState<StaffUser[] | null>(null);

  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState("직원");
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editRole, setEditRole] = useState("직원");
  const [editError, setEditError] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  useEffect(() => {
    refresh();
  }, []);

  function refresh() {
    fetch("/api/staff-users?includeInactive=1")
      .then((res) => res.json())
      .then(setStaffUsers);
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setAddError(null);
    setAdding(true);
    try {
      const res = await fetch("/api/staff-users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName, role: newRole }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAddError(data.error ?? "직원 추가에 실패했습니다.");
        return;
      }
      setNewName("");
      setNewRole("직원");
      refresh();
    } finally {
      setAdding(false);
    }
  }

  function startEdit(u: StaffUser) {
    setEditingId(u.id);
    setEditName(u.name);
    setEditRole(u.role);
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
      const res = await fetch(`/api/staff-users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName, role: editRole }),
      });
      const data = await res.json();
      if (!res.ok) {
        setEditError(data.error ?? "수정에 실패했습니다.");
        return;
      }
      setEditingId(null);
      refresh();
    } finally {
      setEditSaving(false);
    }
  }

  async function toggleActive(u: StaffUser) {
    const action = u.isActive ? "비활성화" : "재활성화";
    if (!window.confirm(`${u.name}님을 ${action}하시겠습니까?`)) return;
    await fetch(`/api/staff-users/${u.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !u.isActive }),
    });
    refresh();
  }

  return (
    <div className={styles.container}>
      <h1 className={styles.pageTitle}>직원 관리</h1>
      <p className={styles.muted}>
        여기서 추가/비활성화한 직원은 &ldquo;현재 사용자&rdquo; 드롭다운에 즉시 반영됩니다. 비활성화는
        완전 삭제가 아니라 과거 기록(체크한 사람/담당자)의 이름 표시를 그대로 보존하기 위한
        처리입니다 — 필요하면 다시 활성화할 수 있습니다.
      </p>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>신규 직원 추가</div>
        <form className={styles.row} onSubmit={handleAdd}>
          <input
            type="text"
            placeholder="이름"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <select value={newRole} onChange={(e) => setNewRole(e.target.value)}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <button type="submit" disabled={adding}>
            추가
          </button>
        </form>
        {addError && <p className={styles.errorText}>{addError}</p>}
      </div>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>직원 목록 ({staffUsers?.length ?? 0}명)</div>
        {staffUsers === null ? (
          <p className={styles.muted}>불러오는 중...</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>이름</th>
                <th>역할</th>
                <th>상태</th>
                <th>관리</th>
              </tr>
            </thead>
            <tbody>
              {staffUsers.map((u) => (
                <tr key={u.id} className={u.isActive ? undefined : styles.inactiveRow}>
                  {editingId === u.id ? (
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
                        <select value={editRole} onChange={(e) => setEditRole(e.target.value)}>
                          {ROLES.map((r) => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>{u.isActive ? "활성" : "비활성"}</td>
                      <td>
                        <span className={styles.rowActions}>
                          <button
                            type="button"
                            className={styles.editButton}
                            onClick={() => saveEdit(u.id)}
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
                      <td>{u.name}</td>
                      <td>{u.role}</td>
                      <td>
                        <span className={u.isActive ? styles.statusActive : styles.statusInactive}>
                          {u.isActive ? "활성" : "비활성"}
                        </span>
                      </td>
                      <td>
                        <span className={styles.rowActions}>
                          <button
                            type="button"
                            className={styles.editButton}
                            onClick={() => startEdit(u)}
                          >
                            수정
                          </button>
                          <button
                            type="button"
                            className={u.isActive ? styles.deactivateButton : styles.activateButton}
                            onClick={() => toggleActive(u)}
                          >
                            {u.isActive ? "비활성화" : "재활성화"}
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
