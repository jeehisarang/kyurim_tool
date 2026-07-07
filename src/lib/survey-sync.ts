import { prisma } from "@/lib/db";
import { getSheetRows } from "@/lib/google-sheets";

const COL_TIMESTAMP = 0;
const COL_NAME = 1;
const COL_PHONE = 2;

function buildSourceRowId(timestamp: string, name: string, phone: string): string {
  return `${timestamp}__${name}__${phone}`;
}

function rowToRawDataJson(header: string[], row: string[]): string {
  const record: Record<string, string> = {};
  header.forEach((label, i) => {
    const key = label.trim() || `컬럼${i + 1}`;
    record[key] = row[i] ?? "";
  });
  return JSON.stringify(record);
}

/**
 * 구글폼(킬팻캡슐 3일체험 설문) 응답 시트를 폴링해서 아직 캐시에 없는 행만 추가한다.
 * sourceRowId(타임스탬프+이름+연락처)로 중복을 막으므로 여러 번 호출해도 안전하다.
 */
export async function syncSurveyResponses(): Promise<{ inserted: number; checked: number }> {
  const rows = await getSheetRows();
  if (rows.length < 2) return { inserted: 0, checked: 0 };

  const [header, ...dataRows] = rows;

  const candidates = dataRows
    .map((row) => {
      const timestamp = row[COL_TIMESTAMP]?.trim() ?? "";
      const name = row[COL_NAME]?.trim() ?? "";
      const phone = row[COL_PHONE]?.trim() ?? "";
      if (!timestamp || !name) return null; // 빈 행/제출 미완료 행 스킵
      return {
        sourceRowId: buildSourceRowId(timestamp, name, phone),
        respondentName: name,
        respondentPhone: phone,
        rawDataJson: rowToRawDataJson(header, row),
      };
    })
    .filter((c): c is NonNullable<typeof c> => c !== null);

  if (candidates.length === 0) return { inserted: 0, checked: 0 };

  const existing = await prisma.surveyResponseCache.findMany({
    where: { sourceRowId: { in: candidates.map((c) => c.sourceRowId) } },
    select: { sourceRowId: true },
  });
  const existingIds = new Set(existing.map((e) => e.sourceRowId));
  const toInsert = candidates.filter((c) => !existingIds.has(c.sourceRowId));

  if (toInsert.length > 0) {
    await prisma.surveyResponseCache.createMany({ data: toInsert });
  }

  return { inserted: toInsert.length, checked: candidates.length };
}
