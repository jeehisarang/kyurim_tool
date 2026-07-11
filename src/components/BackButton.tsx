"use client";

import { useRouter } from "next/navigation";
import styles from "./BackButton.module.css";

/**
 * 히스토리 깊이(window.history.length)로 "뒤로 갈 곳이 있는지"를 근사 판단한다 —
 * 새 탭에서 링크로 바로 진입한 경우 등 완벽히 감지할 수는 없지만, 실사용 범위에서는
 * 충분한 근사치. 뒤로 갈 곳이 없다고 판단되면 홈으로 보낸다.
 */
export default function BackButton() {
  const router = useRouter();

  function handleClick() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push("/home");
    }
  }

  return (
    <button
      type="button"
      className={styles.backButton}
      onClick={handleClick}
      aria-label="뒤로가기"
    >
      <span aria-hidden="true">←</span>
      <span>뒤로</span>
    </button>
  );
}
