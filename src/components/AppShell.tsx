"use client";

import { usePathname } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import CurrentUserBadge from "@/components/CurrentUserBadge";
import ActivityRail from "@/components/ActivityRail";
import { CurrentUserProvider } from "@/lib/CurrentUserContext";
import styles from "@/app/layout.module.css";

/**
 * /patient-view/*, /p/{token}(환자 티칭지 공개 페이지), /s/{token}(환자별 통합
 * 공유링크 공개 페이지, 14-11) 경로는 인증 없이 환자에게 그대로 노출되는 완전 별도
 * 화면이라 사이드바/내비게이션/"현재 사용자" 배지가 전혀 없어야 한다 —
 * Next.js는 root layout을 경로별로 분리하려면 앱 전체 디렉토리 구조를 route group으로
 * 재편해야 해서(대규모 변경), 대신 이 얇은 클라이언트 래퍼에서 경로를 보고 기존 사이드바
 * 셸을 건너뛰는 쪽을 택했다.
 *
 * /consult-mode(원장 상담모드, 14-5)는 사이드바 없는 독립 창이지만 환자 대면용은 아니라
 * "현재 사용자"(role 판별용) 컨텍스트는 그대로 필요하다 — Sidebar/CurrentUserBadge만
 * 건너뛰고 CurrentUserProvider는 유지하는 세 번째 분기.
 *
 * ActivityRail(실시간 활동피드, 14-7)은 사이드바가 있는 마지막 분기에서만 렌더링한다 —
 * 독립 창 두 분기(공개 페이지/상담모드)에는 노출하지 않는다(task.md 지시).
 */
export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isPublicPatientFacing =
    (pathname?.startsWith("/patient-view") ||
      pathname?.startsWith("/p/") ||
      pathname?.startsWith("/s/") ||
      // 킬팻캡슐 3일체험 추천 이벤트(task.md) 공개 페이지들 — /refer/ 전체가 아니라
      // trial(신청폼)/exit(마감설문)/my(내 추천 현황)만(그 아래는 전부 공개 페이지).
      // /refer/exit는 이 목록에서 누락돼 있던 걸 이번에 함께 발견해 고쳤다(/refer/my
      // 추가 작업 중 확인 — 그동안 마감설문 공개페이지에 직원용 사이드바+실시간
      // 활동피드가 그대로 노출되고 있었다). 직원용 화면이 /refer/ 하위에 생기더라도
      // 이 접두사들과 겹치지 않게 주의할 것.
      pathname?.startsWith("/refer/trial") ||
      pathname?.startsWith("/refer/exit") ||
      pathname?.startsWith("/refer/my")) ??
    false;
  const isStandaloneStaffPage = pathname?.startsWith("/consult-mode") ?? false;

  if (isPublicPatientFacing) {
    return <>{children}</>;
  }

  if (isStandaloneStaffPage) {
    return <CurrentUserProvider>{children}</CurrentUserProvider>;
  }

  return (
    <CurrentUserProvider>
      <div className={styles.shell}>
        <Sidebar />
        <main className={styles.main}>
          <CurrentUserBadge />
          {children}
        </main>
        <ActivityRail />
      </div>
    </CurrentUserProvider>
  );
}
