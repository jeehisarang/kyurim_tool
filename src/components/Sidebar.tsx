"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./Sidebar.module.css";
import CurrentUserSelector from "@/components/CurrentUserSelector";
import { useCurrentUserContext } from "@/lib/CurrentUserContext";

const MENU_ITEMS = [
  { label: "홈", href: "/home" },
  { label: "내원체크", href: "/visit-check" },
  { label: "오늘 할 일", href: "/todo" },
  { label: "치료처방", href: "/prescriptions" },
  { label: "검사", href: "/examinations" },
  { label: "AI 생성", href: "/ai-studio" },
  { label: "통계 대시보드", href: "/dashboard" },
];

// 완벽한 보안이 아니라 실수/오남용 방지 목적의 가벼운 노출 조건 — 원장 역할일 때만 보임.
const SETTINGS_MENU_ITEM = { label: "설정", href: "/settings/staff" };

export default function Sidebar() {
  const pathname = usePathname();
  const { currentUser } = useCurrentUserContext();
  const menuItems =
    currentUser?.role === "원장" ? [...MENU_ITEMS, SETTINGS_MENU_ITEM] : MENU_ITEMS;

  return (
    <aside className={styles.sidebar}>
      <div className={styles.title}>규림한의원 통합 툴</div>

      <nav className={styles.nav}>
        {menuItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={isActive ? `${styles.navItem} ${styles.navItemActive}` : styles.navItem}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className={styles.userSelector}>
        <CurrentUserSelector />
      </div>
    </aside>
  );
}
