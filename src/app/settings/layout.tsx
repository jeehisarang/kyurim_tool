"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./layout.module.css";

const TABS = [
  { label: "직원 관리", href: "/settings/staff" },
  { label: "공지사항 관리", href: "/settings/announcements" },
  { label: "프로그램 관리", href: "/settings/programs" },
  { label: "프로그램 티칭 관리", href: "/settings/program-teaching" },
  { label: "상담유형 관리", href: "/settings/consultation-types" },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div>
      <nav className={styles.tabNav}>
        {TABS.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className={pathname === tab.href ? `${styles.tab} ${styles.tabActive}` : styles.tab}
          >
            {tab.label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
