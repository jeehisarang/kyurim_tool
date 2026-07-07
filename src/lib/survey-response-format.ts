export function parseSurveyRawData(rawDataJson: string): Record<string, string> {
  try {
    const parsed = JSON.parse(rawDataJson);
    if (parsed && typeof parsed === "object") return parsed as Record<string, string>;
  } catch {
    // 파싱 실패 시 빈 객체로 취급
  }
  return {};
}

export function getSurveySubmittedAtLabel(rawDataJson: string): string {
  return parseSurveyRawData(rawDataJson)["타임스탬프"] ?? "";
}

/** rawDataJson(헤더-값 매핑)을 처방등록 화면의 설문 textarea에 채워넣을 수 있는 텍스트로 정리 */
export function formatSurveyResponseText(rawDataJson: string): string {
  const record = parseSurveyRawData(rawDataJson);
  const lines: string[] = [];
  for (const [label, value] of Object.entries(record)) {
    const trimmed = (value ?? "").trim();
    if (!trimmed) continue;
    lines.push(`${label}: ${trimmed}`);
  }
  return lines.join("\n");
}
