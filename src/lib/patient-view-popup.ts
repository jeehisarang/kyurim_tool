// "환자와 함께보기" 팝업 공통 오프너 — 여러 화면(검사 등록/이력/상세)이 동일한 팝업
// 차단 감지 로직을 중복 구현하고 있어 하나로 모았다. HRV는 결과지 이미지 판독을 위해
// 기본보다 큰 창이 필요해(task.md 3번) width/height를 옵션으로 받는다.
export function openPatientViewPopup(
  url: string,
  size: { width: number; height: number } = { width: 760, height: 900 },
): boolean {
  const win = window.open(
    url,
    "_blank",
    `noopener,noreferrer,width=${size.width},height=${size.height}`,
  );
  // 브라우저 팝업 차단 시 window.open이 null을 반환하거나, 반환은 되지만 즉시 closed
  // 상태인 창을 주는 경우가 있어 둘 다 확인한다.
  return !win || win.closed;
}

// HRV 결과지는 작은 글씨가 많아 기본 팝업(760x900)보다 훨씬 크게 띄운다.
export const HRV_PATIENT_VIEW_POPUP_SIZE = { width: 1100, height: 980 };
