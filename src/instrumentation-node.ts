import { syncSurveyResponses } from "@/lib/survey-sync";
import { ensureTodayDashboardSnapshot } from "@/lib/stats";

const POLL_INTERVAL_MS = 5 * 60 * 1000;

const globalForSurveyPoll = globalThis as unknown as { surveyPollStarted?: boolean };

async function runSyncOnce() {
  try {
    const result = await syncSurveyResponses();
    if (result.inserted > 0) {
      console.log(`[survey-sync] 신규 설문 응답 ${result.inserted}건 캐시에 추가됨 (검사 ${result.checked}건)`);
    }
  } catch (err) {
    console.error("[survey-sync] 구글시트 폴링 실패:", err);
  }
}

// dev 모드 HMR로 이 모듈이 재평가돼도 setInterval이 중복 등록되지 않도록 전역 플래그로 방지.
if (!globalForSurveyPoll.surveyPollStarted) {
  globalForSurveyPoll.surveyPollStarted = true;
  void runSyncOnce();
  setInterval(runSyncOnce, POLL_INTERVAL_MS);
}

// 통계 대시보드 스냅샷 배치(task2.md 결정1) — 별도 cron/스케줄러 인프라가 없는 프로젝트라
// survey-sync와 동일한 "주기적 폴링 + 멱등 처리" 패턴을 재사용한다. ensureTodayDashboardSnapshot
// 내부에서 새벽 3시 이전이거나 오늘자 스냅샷이 이미 있으면 조용히 스킵한다.
const DASHBOARD_SNAPSHOT_POLL_INTERVAL_MS = 10 * 60 * 1000;

const globalForDashboardSnapshot = globalThis as unknown as { dashboardSnapshotPollStarted?: boolean };

async function runDashboardSnapshotCheckOnce() {
  try {
    await ensureTodayDashboardSnapshot();
  } catch (err) {
    console.error("[dashboard-snapshot] 스냅샷 생성 실패:", err);
  }
}

if (!globalForDashboardSnapshot.dashboardSnapshotPollStarted) {
  globalForDashboardSnapshot.dashboardSnapshotPollStarted = true;
  void runDashboardSnapshotCheckOnce();
  setInterval(runDashboardSnapshotCheckOnce, DASHBOARD_SNAPSHOT_POLL_INTERVAL_MS);
}
