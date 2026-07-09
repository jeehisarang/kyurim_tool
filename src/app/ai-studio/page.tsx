"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import styles from "./page.module.css";
import TalkStudioPanel from "@/components/TalkStudioPanel";

const TABS = [
  { key: "talk", label: "톡 생성" },
  { key: "event-image", label: "이벤트 이미지" },
  { key: "teaching", label: "환자 티칭지" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

// "톡 생성" 탭 전용 파라미터 — 다른 탭으로 전환하면 의미가 없어지므로 제거한다.
const TALK_ONLY_PARAMS = ["talkGroup", "patientId", "date", "todoTaskId", "messageType", "chartNumber", "name"];

/**
 * 이전 "톡생성기"(/messages)를 "AI 생성" 안 탭 구조로 재배치한 화면 — 첫 탭 "톡 생성"에
 * 기존 기능을 그대로 옮겨왔고(TalkStudioPanel), 나머지 탭은 향후 확장 자리만 마련해둔다.
 */
export default function AiStudioPage() {
  return (
    <Suspense fallback={null}>
      <AiStudioPageInner />
    </Suspense>
  );
}

function AiStudioPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTab = (searchParams.get("tab") as TabKey | null) ?? "talk";

  function switchTab(key: TabKey) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", key);
    if (key !== "talk") {
      TALK_ONLY_PARAMS.forEach((p) => params.delete(p));
    }
    router.push(`/ai-studio?${params.toString()}`);
  }

  return (
    <div className={styles.container}>
      <h1 className={styles.pageTitle}>AI 생성</h1>

      <nav className={styles.tabNav}>
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={activeTab === tab.key ? styles.tabButtonActive : styles.tabButton}
            onClick={() => switchTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {activeTab === "talk" && <TalkStudioPanel />}
      {activeTab === "event-image" && <p className={styles.comingSoon}>준비 중입니다.</p>}
      {activeTab === "teaching" && <p className={styles.comingSoon}>준비 중입니다.</p>}
    </div>
  );
}
