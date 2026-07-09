import Link from "next/link";
import styles from "./NavTiles.module.css";

// 사이드바 메뉴와 동일한 5개 대상 — 홈 화면에서의 추가 진입점 역할(사이드바는 그대로 유지).
const TILES = [
  { href: "/visit-check", icon: "🩺", label: "내원체크" },
  { href: "/prescriptions", icon: "💊", label: "치료처방" },
  { href: "/examinations", icon: "🧪", label: "검사" },
  { href: "/ai-studio", icon: "💬", label: "AI 생성" },
  { href: "/dashboard", icon: "📊", label: "통계 대시보드" },
];

export default function NavTiles() {
  return (
    <div className={styles.grid}>
      {TILES.map((tile) => (
        <Link key={tile.href} href={tile.href} className={styles.tile}>
          <span className={styles.tileIcon}>{tile.icon}</span>
          <span className={styles.tileLabel}>{tile.label}</span>
        </Link>
      ))}
    </div>
  );
}
