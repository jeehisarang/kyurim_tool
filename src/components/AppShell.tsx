"use client";

import { usePathname } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import CurrentUserBadge from "@/components/CurrentUserBadge";
import { CurrentUserProvider } from "@/lib/CurrentUserContext";
import styles from "@/app/layout.module.css";

/**
 * /patient-view/* 경로는 원장님이 환자와 함께 보는 완전 별도 화면이라 사이드바/내비게이션/
 * "현재 사용자" 배지가 전혀 없어야 한다 — Next.js는 root layout을 경로별로 분리하려면
 * 앱 전체 디렉토리 구조를 route group으로 재편해야 해서(대규모 변경), 대신 이 얇은
 * 클라이언트 래퍼에서 경로를 보고 기존 사이드바 셸을 건너뛰는 쪽을 택했다.
 */
export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isPatientView = pathname?.startsWith("/patient-view") ?? false;

  if (isPatientView) {
    return <>{children}</>;
  }

  return (
    <CurrentUserProvider>
      <div className={styles.shell}>
        <Sidebar />
        <main className={styles.main}>
          <CurrentUserBadge />
          {children}
        </main>
      </div>
    </CurrentUserProvider>
  );
}
