/**
 * 추천이벤트(ReferralLink) 관련 공개 URL의 base — 반드시 NEXT_PUBLIC_SHARE_BASE_URL만
 * 쓴다(task.md). window.location.origin으로 폴백하면 사무실/집 PC를 LAN IP(예:
 * 192.168.x.x)나 localhost로 접속했을 때 그 사설 주소가 그대로 링크·QR코드에 박혀버려서
 * 카카오톡 등으로 공유된 링크를 외부에서 열 수 없게 된다(실제 처방상세 페이지에서
 * 재현 확인). 이 규칙은 ReferralLink 관련 화면에만 적용하고, 기존 /p/, /s/ 링크
 * (ProgramTeachingCreator.tsx, ShareLinkPanel.tsx의 handleGenerateLink)는 이번
 * 범위가 아니라 그대로 둔다.
 */
export function getShareBaseUrl(): string {
  return process.env.NEXT_PUBLIC_SHARE_BASE_URL || "https://link.kyurim.kr";
}
