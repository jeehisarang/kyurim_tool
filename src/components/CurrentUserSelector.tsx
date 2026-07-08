"use client";

import styles from "./CurrentUserSelector.module.css";
import { useCurrentUserContext } from "@/lib/CurrentUserContext";

export default function CurrentUserSelector() {
  const { staffUsers, currentUser, loaded, loadError, retryLoad, requestSwitchUser } =
    useCurrentUserContext();

  function handleChange(value: string) {
    requestSwitchUser(value ? Number(value) : null);
  }

  if (loadError) {
    return (
      <div className={styles.bar}>
        <span className={styles.label}>현재 사용자</span>
        <span className={styles.hint}>직원 목록을 불러오지 못했습니다.</span>
        <button type="button" className={styles.retryButton} onClick={retryLoad}>
          다시 시도
        </button>
      </div>
    );
  }

  return (
    <div className={styles.bar}>
      <span className={styles.label}>현재 사용자</span>
      <select
        className={styles.select}
        value={currentUser?.id ?? ""}
        onChange={(e) => handleChange(e.target.value)}
      >
        <option value="">사용자를 선택하세요</option>
        {staffUsers.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name} ({u.role})
          </option>
        ))}
      </select>
      {loaded && !currentUser && <span className={styles.hint}>사용자를 선택하세요</span>}
    </div>
  );
}
