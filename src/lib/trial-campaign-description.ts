export type ParsedCampaignDescription = {
  intro: string[];
  body: string[];
  checklist: string[];
  closing: string | null;
};

const CHECK_MARK_PATTERN = /^[✓✔]\s*/;
// "*캐치프레이즈*" 형태(원장이 자유텍스트 textarea에 마크다운처럼 별표로 감싼 것)나
// 따옴표로 감싼 경우 둘 다 캐치프레이즈로 인식하고, 표시할 땐 감싼 기호를 벗겨낸다.
const WRAPPED_EMPHASIS_PATTERN = /^[*"'“‘]+([\s\S]*?)[*"'”’]+$/;

/**
 * 체험신청 완료화면 설명 문구 파서(task2.md) — 원장이 설정화면에 자유 텍스트로 입력한
 * 문구를 빈 줄 기준 문단으로 나눈 뒤, "✓/✔"로 시작하는 줄을 체크리스트로 뽑아내고
 * 나머지 문단을 캐치프레이즈+소개(첫 1~2문단) / 중간 설명 / 마무리 문장(마지막 문단)
 * 으로 자동 분류한다. 문구 내용 자체는 손대지 않고 표시 방식만 바꾸는 게 목적이라
 * (원장 문구를 있는 그대로 유지) 별도 필드로 나누지 않고 매번 이 함수로 다시 파싱한다.
 */
export function parseCampaignDescription(raw: string): ParsedCampaignDescription {
  const normalized = raw.replace(/\r\n/g, "\n");
  const rawBlocks = normalized
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean);

  const checklist: string[] = [];
  const paragraphBlocks: string[] = [];

  for (const block of rawBlocks) {
    const keptLines: string[] = [];
    for (const line of block.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (CHECK_MARK_PATTERN.test(trimmed)) {
        checklist.push(trimmed.replace(CHECK_MARK_PATTERN, ""));
      } else {
        keptLines.push(trimmed);
      }
    }
    if (keptLines.length > 0) paragraphBlocks.push(keptLines.join("\n"));
  }

  if (paragraphBlocks.length === 0) {
    return { intro: [], body: [], checklist, closing: null };
  }
  // 문단이 하나뿐이면(기본 안내문구 등) 굳이 캐치프레이즈/마무리로 나누지 않고
  // 평범한 본문으로만 표시한다.
  if (paragraphBlocks.length === 1) {
    return { intro: [], body: paragraphBlocks, checklist, closing: null };
  }

  const closing = paragraphBlocks.pop()!;
  const firstIsCatchphrase = WRAPPED_EMPHASIS_PATTERN.test(paragraphBlocks[0]);
  const introCount = firstIsCatchphrase && paragraphBlocks.length >= 2 ? 2 : 1;
  const intro = paragraphBlocks.splice(0, introCount).map((block, i) => {
    if (i !== 0) return block;
    const match = block.match(WRAPPED_EMPHASIS_PATTERN);
    return match ? match[1].trim() : block;
  });

  return { intro, body: paragraphBlocks, checklist, closing };
}
