// HRV 기기가 만드는 결과지 파일명에서 환자명을 추정해 매칭한다(task2.md) — 자동매칭은
// 기본 선택값 제시용일 뿐, 직원이 항상 재검색/변경할 수 있어야 한다(동명이인/매칭 실패 대비).
// 파일명 관례를 미리 알 수 없어 보수적으로 접근한다: 확장자를 떼고 흔한 구분자(_ - 공백 .)로
// 쪼갠 토큰 각각을 환자명과 정확히 비교하고, 실패하면 파일명 전체에 환자명이 부분 문자열로
// 포함되는지만 추가로 확인한다(오탐 방지 — 짧은 이름이 엉뚱한 토큰에 우연히 걸리는 것을
// 최소화하기 위해 토큰 완전일치를 1순위로 둔다).
export type MatchablePatient = { id: number; name: string; chartNumber: string };

export function guessPatientFromFilename(
  filename: string,
  patients: MatchablePatient[],
): MatchablePatient | null {
  const withoutExt = filename.replace(/\.[^.]+$/, "");
  const tokens = withoutExt.split(/[_\-\s.]+/).filter(Boolean);

  for (const token of tokens) {
    const exact = patients.find((p) => p.name === token);
    if (exact) return exact;
  }

  const substringMatches = patients.filter((p) => p.name.length >= 2 && withoutExt.includes(p.name));
  if (substringMatches.length === 1) return substringMatches[0];

  return null;
}
