/**
 * navigator.clipboard는 보안 컨텍스트(HTTPS 또는 localhost)에서만 동작한다 — 이 앱은
 * 직원들이 LAN IP(http://192.168.x.x)로 접속하는 비보안 HTTP 환경이라 조용히 실패하고
 * 있었다(task2.md 2번). document.execCommand('copy')(임시 textarea 방식)로 폴백한다 —
 * <textarea>.value는 개행을 그대로 보존하므로 줄바꿈이 있는 긴 문구도 안전하다.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // 폴백으로 진행
    }
  }

  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    // 화면에 보이지 않게 배치 — 스크롤 점프/깜빡임 방지.
    textarea.style.position = "fixed";
    textarea.style.top = "0";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const success = document.execCommand("copy");
    document.body.removeChild(textarea);
    return success;
  } catch {
    return false;
  }
}
