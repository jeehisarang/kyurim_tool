import { syncSurveyResponses } from "@/lib/survey-sync";

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
