"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./Sidebar.module.css";
import CurrentUserSelector from "@/components/CurrentUserSelector";

const MENU_ITEMS = [
  { label: "홈", href: "/home" },
  { label: "내원체크", href: "/visit-check" },
  { label: "톡생성기", href: "/messages" },
  { label: "오늘 할 일", href: "/todo" },
  { label: "치료처방", href: "/prescriptions" },
  { label: "통계 대시보드", href: "/dashboard" },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className={styles.sidebar}>
      <div className={styles.title}>규림한의원 통합 툴</div>

      <nav className={styles.nav}>
        {MENU_ITEMS.map((item) => {
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
