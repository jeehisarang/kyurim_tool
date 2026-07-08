"use client";

import styles from "./CurrentUserBadge.module.css";
import { useCurrentUserContext } from "@/lib/CurrentUserContext";

/**
 * 화면 상단(헤더 영역)에 상시 노출되는 현재 사용자 표시. 사이드바 하단 드롭다운과
 * 별개로, 다른 사용자로 실수 전환된 걸 스크롤 없이 바로 알아챌 수 있게 하는 용도.
 * 모든 페이지 공통 레이아웃(layout.tsx)에서 한 번만 렌더링된다.
 */
export default function CurrentUserBadge() {
  const { currentUser, loaded } = useCurrentUserContext();

  if (!loaded) return null;

  return (
    <div className={styles.badge}>
      {currentUser ? (
        <>
          현재: <strong>{currentUser.name}</strong> ({currentUser.role})
        </>
      ) : (
        <span className={styles.hint}>사용자를 선택하세요</span>
      )}
    </div>
  );
}
