// 활동피드(ActivityLog) 문구에 "~을/를 …했습니다"를 붙일 때 마지막 글자 받침 유무로
// 조사를 고른다 — 프로그램명/상담유형명 등 자유 입력 텍스트가 붙는 자리라 받침이
// 있을 수도 없을 수도 있다. teaching-pages.ts/consultation-notes.ts 등이 공유한다.
export function withObjectParticle(word: string): string {
  const lastChar = word.trim().slice(-1);
  const code = lastChar.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return `${word}을`;
  const hasBatchim = (code - 0xac00) % 28 !== 0;
  return hasBatchim ? `${word}을` : `${word}를`;
}
