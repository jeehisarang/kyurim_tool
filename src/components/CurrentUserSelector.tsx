"use client";

import { useEffect, useState } from "react";
import styles from "./CurrentUserSelector.module.css";
import { getCurrentUserId, setCurrentUserId } from "@/lib/currentUser";

type StaffUser = { id: number; name: string; role: string };

export default function CurrentUserSelector() {
  const [staffUsers, setStaffUsers] = useState<StaffUser[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setSelectedId(getCurrentUserId());
    setLoaded(true);
    fetch("/api/staff-users")
      .then((res) => res.json())
      .then(setStaffUsers);
  }, []);

  function handleChange(value: string) {
    const id = value ? Number(value) : null;
    setSelectedId(id);
    setCurrentUserId(id);
  }

  return (
    <div className={styles.bar}>
      <span className={styles.label}>현재 사용자</span>
      <select
        className={styles.select}
        value={selectedId ?? ""}
        onChange={(e) => handleChange(e.target.value)}
      >
        <option value="">사용자를 선택하세요</option>
        {staffUsers.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name} ({u.role})
          </option>
        ))}
      </select>
      {loaded && !selectedId && <span className={styles.hint}>사용자를 선택하세요</span>}
    </div>
  );
}
