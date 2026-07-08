"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { getCurrentUserId, setCurrentUserId } from "@/lib/currentUser";

export type StaffUser = { id: number; name: string; role: string };

type CurrentUserContextValue = {
  staffUsers: StaffUser[];
  currentUser: StaffUser | null;
  loaded: boolean;
  loadError: boolean;
  /** staffUsers 조회가 실패했을 때 재시도. */
  retryLoad: () => void;
  /** 확인창을 띄운 뒤, 확정한 경우에만 localStorage에 반영한다. */
  requestSwitchUser: (id: number | null) => void;
};

const CurrentUserContext = createContext<CurrentUserContextValue | null>(null);

/**
 * "현재 사용자"(StaffUser) 상태의 단일 원천. Sidebar(설정 메뉴 노출 조건),
 * CurrentUserSelector(드롭다운), CurrentUserBadge(헤더 표시)가 전부 이 컨텍스트 하나를
 * 공유해야 서로 다른 컴포넌트 트리에 있어도 사용자 전환이 즉시 동기화된다 — 각자
 * localStorage를 따로 읽으면 한쪽만 갱신되는 문제가 생긴다.
 */
export function CurrentUserProvider({ children }: { children: React.ReactNode }) {
  const [staffUsers, setStaffUsers] = useState<StaffUser[]>([]);
  const [currentUserId, setCurrentUserIdState] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  // 실사용 중 발견된 문제: 직원 목록 조회가 실패해도 아무 표시 없이 드롭다운이 그냥
  // 빈 채로 남아있었다(에러 처리 없음 + 재시도 수단 없음) — 새로고침 전까지 복구 불가.
  // 반드시 에러 상태로 빠져나가고, retryLoad로 새로고침 없이 다시 시도할 수 있게 한다.
  useEffect(() => {
    setCurrentUserIdState(getCurrentUserId());
    setLoaded(true);
    setLoadError(false);
    fetch("/api/staff-users")
      .then((res) => {
        if (!res.ok) throw new Error("staff-users 응답 실패");
        return res.json();
      })
      .then(setStaffUsers)
      .catch(() => setLoadError(true));
  }, [retryKey]);

  function retryLoad() {
    setRetryKey((k) => k + 1);
  }

  function requestSwitchUser(id: number | null) {
    if (id === currentUserId) return;
    const target = id !== null ? staffUsers.find((u) => u.id === id) : null;
    const label = id === null ? "미선택" : (target?.name ?? "알 수 없음");
    if (!window.confirm(`${label}(으)로 전환하시겠습니까?`)) return;
    setCurrentUserId(id);
    setCurrentUserIdState(id);
  }

  const currentUser = staffUsers.find((u) => u.id === currentUserId) ?? null;

  return (
    <CurrentUserContext.Provider
      value={{ staffUsers, currentUser, loaded, loadError, retryLoad, requestSwitchUser }}
    >
      {children}
    </CurrentUserContext.Provider>
  );
}

export function useCurrentUserContext(): CurrentUserContextValue {
  const ctx = useContext(CurrentUserContext);
  if (!ctx) {
    throw new Error("useCurrentUserContext는 CurrentUserProvider 내부에서만 사용할 수 있습니다.");
  }
  return ctx;
}
