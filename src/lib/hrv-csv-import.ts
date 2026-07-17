import fs from "node:fs/promises";
import path from "node:path";
import iconv from "iconv-lite";
import { prisma } from "@/lib/db";
import { createHrvTestRecord } from "@/lib/hrv";
import { saveHrvResultImage } from "@/lib/image-upload";

// 유비오맥파(Pro) "엑셀 변환" CSV 자동연동(task.md) — 원장실 PC에서 Google Drive 데스크탑
// 앱으로 동기화되는 로컬 폴더를 주기적으로 스캔해 HRV 검사기록을 자동 생성한다. 이 폴더
// 경로는 PC마다 다를 수 있어 코드에 하드코딩하지 않고 환경변수로 관리한다(.env).
//
// 트리거 방식: 별도 백그라운드 프로세스(chokidar/cron) 대신, 이 코드베이스가 이미
// generateTalkTodos()에서 쓰고 있는 "관련 페이지 조회(GET) 시점마다 자가치유" 패턴을
// 그대로 따른다 — 서버 재시작 시에도 별도 커서/상태를 잃을 걱정이 없다(매번 폴더 전체를
// 다시 훑고, csvSourceKey/HrvImportPending의 유니크 제약으로 이미 처리한 행을 건너뛴다).

// CSV 헤더 컬럼 순서(원장님 실측 확인, task.md 2번) — 헤더 문자열이 아니라 "이 위치에 있는
// 값"으로 파싱한다(디바이스 소프트웨어가 헤더 문구를 바꿀 수도 있고, 어차피 매 행 위치는
// 고정이므로 위치 기반이 더 안전하다).
const COLUMN = {
  userName: 0,
  gender: 1,
  birthYear: 2,
  age: 3,
  chartNumber: 4,
  measuredAt: 5,
  vascularHealthIndex: 7,
  vascularHealthType: 8,
  avgPulse: 17,
  stressIndex: 18,
  tp: 21,
  vlf: 22,
  lf: 23,
  hf: 24,
  lfHfRatio: 25,
  sdnn: 26,
  rmssd: 27,
} as const;

type ParsedRow = {
  userName: string;
  gender: string | null;
  birthYear: number | null;
  age: number | null;
  rawChartNumber: string | null;
  measuredAt: Date;
  vascularHealthIndex: number | null;
  vascularHealthType: string | null;
  avgPulse: number | null;
  stressIndex: number | null;
  tp: number | null;
  vlf: number | null;
  lf: number | null;
  hf: number | null;
  lfHfRatio: number | null;
  sdnn: number | null;
  rmssd: number | null;
};

function toNumberOrNull(value: string | undefined): number | null {
  if (value === undefined) return null;
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

function toStringOrNull(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

// "2026-07-16 12:27:47" — ISO가 아니라 공백 구분 로컬시각이라 다른 날짜 파싱(examDate 등)과
// 동일하게 직접 정규식으로 분해한다(new Date(string) 브라우저/엔진별 파싱 차이 회피 원칙).
function parseMeasuredAt(raw: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(raw.trim());
  if (!match) return null;
  const [, y, mo, d, h, mi, s] = match;
  return new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s));
}

// CSV 구분자는 콤마 뒤에 탭이 붙는 형태(실측 확인) — 콤마로 쪼갠 뒤 각 필드를 trim하면
// 탭/공백이 함께 제거된다. 필드값 자체에 콤마가 들어가는 경우는 실측 샘플에서 없었다
// (한글 필드에도 콤마가 안 나옴 — 별도 CSV 라이브러리 없이 처리 가능).
function splitCsvLine(line: string): string[] {
  return line.split(",").map((f) => f.trim());
}

// 측정 모드에 따라 컬럼이 부분적으로 비어있을 수 있다(task.md 2번) — 사용자명/측정일시가
// 없는 행은 파싱 불가로 건너뛴다(빈 줄 등 방어적 처리).
function parseRow(fields: string[]): ParsedRow | null {
  const userName = fields[COLUMN.userName]?.trim();
  if (!userName) return null;
  const measuredAt = parseMeasuredAt(fields[COLUMN.measuredAt] ?? "");
  if (!measuredAt) return null;

  return {
    userName,
    gender: toStringOrNull(fields[COLUMN.gender]),
    birthYear: toNumberOrNull(fields[COLUMN.birthYear]),
    age: toNumberOrNull(fields[COLUMN.age]),
    rawChartNumber: toStringOrNull(fields[COLUMN.chartNumber]),
    measuredAt,
    vascularHealthIndex: toNumberOrNull(fields[COLUMN.vascularHealthIndex]),
    vascularHealthType: toStringOrNull(fields[COLUMN.vascularHealthType]),
    avgPulse: toNumberOrNull(fields[COLUMN.avgPulse]),
    stressIndex: toNumberOrNull(fields[COLUMN.stressIndex]),
    tp: toNumberOrNull(fields[COLUMN.tp]),
    vlf: toNumberOrNull(fields[COLUMN.vlf]),
    lf: toNumberOrNull(fields[COLUMN.lf]),
    hf: toNumberOrNull(fields[COLUMN.hf]),
    lfHfRatio: toNumberOrNull(fields[COLUMN.lfHfRatio]),
    sdnn: toNumberOrNull(fields[COLUMN.sdnn]),
    rmssd: toNumberOrNull(fields[COLUMN.rmssd]),
  };
}

function csvSourceKeyOf(userName: string, measuredAt: Date): string {
  return `${userName}|${measuredAt.toISOString()}`;
}

function compactTimestamp(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

// capture 폴더 파일명 규칙(실측 확인, task.md) — "{사용자명}_{YYYYMMDD_HHMMSS}.ppg.jpg"는
// "혈관건강도 측정"만 한 단독 세션, ".hrv.jpg"는 "스트레스 지수 측정"까지 마친 전체 세션.
// 이 행이 어느 쪽인지(hasFullSession)로 우선 확장자를 정하되, 기기 소프트웨어 동작이 100%
// 일관되지 않을 수 있어 다른 쪽도 확인한다. 매칭 안 되면 null — 다음 스캔에서 이미지가
// 뒤늦게 생겼을 수 있으니(csv를 먼저 쓰고 캡처를 나중에 만들 수도 있음) 계속 재시도한다
// (이 행 자체를 아직 "처리 완료"로 기록하지 않았으므로 자연히 재시도됨).
async function findCaptureImagePath(
  captureDir: string,
  userName: string,
  measuredAt: Date,
  hasFullSession: boolean,
): Promise<string | null> {
  const ts = compactTimestamp(measuredAt);
  const extOrder = hasFullSession ? ["hrv", "ppg"] : ["ppg", "hrv"];
  for (const ext of extOrder) {
    const candidate = path.join(captureDir, `${userName}_${ts}.${ext}.jpg`);
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // 다음 확장자 시도
    }
  }
  return null;
}

export type HrvCsvScanResult = {
  created: number;
  queued: number;
  // 이미 처리해서 건너뛴 행(csvSourceKey/HrvImportPending 유니크키로 판단, 중복 방지).
  skipped: number;
  // 환자는 매칭됐지만 캡처 이미지가 아직 안 보여서 이번 스캔엔 아무 것도 안 한 행 —
  // 다음 스캔에서 이미지가 생기면 자동 재시도된다(대기열에 넣지 않음).
  awaitingImage: number;
};

/**
 * HRV CSV 자동연동 스캔 — 관련 페이지 GET 시점마다 호출된다(자가치유 패턴, 위 주석 참고).
 * 폴더 미설정/접근 불가 시 조용히 아무 일도 하지 않는다(page load 자체를 절대 깨뜨리지
 * 않는다 — Google Drive 동기화가 일시적으로 끊겼다고 검사 목록 화면이 에러나면 안 됨).
 */
export async function scanHrvCsvImports(): Promise<HrvCsvScanResult> {
  const folderPath = process.env.HRV_CSV_FOLDER_PATH;
  const result: HrvCsvScanResult = { created: 0, queued: 0, skipped: 0, awaitingImage: 0 };
  if (!folderPath) return result;

  // 실 폴더 구조 실측 확인(task.md, 2026-07-17) — HRV_CSV_FOLDER_PATH(맥파기검사기록지)
  // 바로 밑에 csv/, capture/가 형제 폴더로 존재한다(csv 파일이 folderPath 최상위에 바로
  // 있는 게 아니다). capture/csv는 실측 결과 빈 파일(헤더만)이라 신뢰할 수 없어 스캔 대상에서
  // 제외한다 — capture 하위가 아니라 folderPath/csv만 스캔해서 자연히 배제된다.
  const csvDir = path.join(folderPath, "csv");
  const captureDir = path.join(folderPath, "capture");

  let entries: string[];
  try {
    entries = await fs.readdir(csvDir);
  } catch (err) {
    // 드라이브 문자 마운트 해제 등(task.md 5번) — 서버를 죽이지 않고 로그만 남긴 뒤
    // 다음 폴링(다음 GET 호출)에서 자연히 재시도된다.
    console.error(`[hrv-csv-import] 폴더 접근 실패, 다음 스캔에 재시도: ${csvDir}`, err);
    return result;
  }

  // 폴더 내 모든 *.csv를 스캔하고 특정 파일명을 하드코딩하지 않는다(다음날 새 파일이
  // 생기는지 미확인이므로).
  const csvFiles = entries.filter((f) => f.toLowerCase().endsWith(".csv"));

  for (const fileName of csvFiles) {
    await scanOneFile(path.join(csvDir, fileName), fileName, captureDir, result);
  }

  return result;
}

async function scanOneFile(
  filePath: string,
  fileName: string,
  captureDir: string,
  result: HrvCsvScanResult,
): Promise<void> {
  let buffer: Buffer;
  try {
    buffer = await fs.readFile(filePath);
  } catch {
    return;
  }

  // CP949(EUC-KR) 디코딩 필수(task.md) — UTF-8로 그대로 읽으면 한글이 깨진다.
  const text = iconv.decode(buffer, "cp949");
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length <= 1) return; // 헤더만 있고 데이터 행 없음

  for (const line of lines.slice(1)) {
    const row = parseRow(splitCsvLine(line));
    if (!row) continue;
    await processRow(row, fileName, captureDir, result);
  }
}

async function processRow(
  row: ParsedRow,
  fileName: string,
  captureDir: string,
  result: HrvCsvScanResult,
): Promise<void> {
  const csvSourceKey = csvSourceKeyOf(row.userName, row.measuredAt);

  // 중복 방지(task.md 4번) — 이미 정식 레코드로 만들어졌거나 대기열에 있으면 건너뛴다.
  // HrvImportPending은 RESOLVED/IGNORED가 된 뒤에도 유니크키를 남겨둬서(레코드 삭제 안 함)
  // 재스캔 시 다시 대기열에 쌓이지 않는다.
  const [existingRecord, existingPending] = await Promise.all([
    prisma.hrvTestRecord.findUnique({ where: { csvSourceKey } }),
    prisma.hrvImportPending.findUnique({
      where: { userName_measuredAt: { userName: row.userName, measuredAt: row.measuredAt } },
    }),
  ]);
  if (existingRecord || existingPending) {
    result.skipped++;
    return;
  }

  const hasFullSession = row.stressIndex !== null;
  const imagePath = await findCaptureImagePath(captureDir, row.userName, row.measuredAt, hasFullSession);

  const matchedPatient = row.rawChartNumber
    ? await prisma.patient.findUnique({ where: { chartNumber: row.rawChartNumber } })
    : null;

  // 자동 생성 조건(task.md 3번) — 차트번호가 실제 환자와 일치 + 캡처 이미지 확보 + 핵심
  // 3개 지표(혈관건강지수/혈관건강도/평균맥박)가 있어야 한다. sourceImagePath는 필수 필드라
  // 이미지 없이는 레코드 자체를 만들 수 없다 — 이미지가 아직 없으면(csv를 캡처보다 먼저
  // 쓰는 타이밍) 이번엔 대기열로 보내지 않고 아무 것도 기록하지 않아 다음 스캔에서 다시
  // 시도된다.
  const canAutoCreate =
    matchedPatient !== null &&
    imagePath !== null &&
    row.vascularHealthIndex !== null &&
    row.vascularHealthType !== null &&
    row.avgPulse !== null;

  if (canAutoCreate) {
    const imageBuffer = await fs.readFile(imagePath!);
    await createHrvTestRecord({
      patientId: matchedPatient!.id,
      testDate: row.measuredAt,
      vascularHealthIndex: row.vascularHealthIndex!,
      vascularHealthType: row.vascularHealthType!,
      avgPulse: row.avgPulse!,
      stressIndex: row.stressIndex,
      imageBuffer,
      measuredByStaffId: null,
      tp: row.tp,
      vlf: row.vlf,
      lf: row.lf,
      hf: row.hf,
      lfHfRatio: row.lfHfRatio,
      sdnn: row.sdnn,
      rmssd: row.rmssd,
      csvSourceKey,
    });
    result.created++;
    return;
  }

  // matchedPatient가 있는데 이미지가 아직 없는 경우(재시도 대상)는 대기열에 넣지 않고
  // 그냥 넘어간다 — 위 canAutoCreate 조건이 false인 이유가 "이미지 없음"뿐이라면 다음
  // 스캔을 기다린다.
  if (matchedPatient !== null && imagePath === null) {
    result.awaitingImage++;
    return;
  }

  // 그 외(번호 없음/매칭 실패/핵심 지표 누락)는 미매칭 대기열로 — 직원이 화면에서 수동 지정.
  const capturedImagePath = imagePath ? (await saveHrvResultImage(await fs.readFile(imagePath))).path : null;
  await prisma.hrvImportPending.create({
    data: {
      userName: row.userName,
      gender: row.gender,
      birthYear: row.birthYear,
      age: row.age,
      rawChartNumber: row.rawChartNumber,
      measuredAt: row.measuredAt,
      vascularHealthIndex: row.vascularHealthIndex,
      vascularHealthType: row.vascularHealthType,
      avgPulse: row.avgPulse,
      stressIndex: row.stressIndex,
      tp: row.tp,
      vlf: row.vlf,
      lf: row.lf,
      hf: row.hf,
      lfHfRatio: row.lfHfRatio,
      sdnn: row.sdnn,
      rmssd: row.rmssd,
      capturedImagePath,
      sourceFile: fileName,
    },
  });
  result.queued++;
}

/**
 * 미매칭 대기열 1건을 직원이 환자를 지정해 정식 HrvTestRecord로 전환한다 — 이미 저장해둔
 * capturedImagePath를 다시 읽어 createHrvTestRecord에 넘긴다(같은 파이프라인 재사용,
 * task.md 3번 "기존 로직 재사용" 확인사항).
 */
export async function resolveHrvImportPending(
  pendingId: number,
  patientId: number,
  staffUserId: number,
): Promise<{ hrvTestRecordId: number } | null> {
  const pending = await prisma.hrvImportPending.findUnique({ where: { id: pendingId } });
  if (!pending || pending.status !== "PENDING") return null;
  if (pending.vascularHealthIndex === null || pending.vascularHealthType === null || pending.avgPulse === null) {
    throw new Error("핵심 지표(혈관건강지수/혈관건강도/평균맥박)가 없어 정식 검사기록으로 전환할 수 없습니다.");
  }
  if (!pending.capturedImagePath) {
    throw new Error("결과지 이미지를 찾지 못해 정식 검사기록으로 전환할 수 없습니다.");
  }

  const imageBuffer = await fs.readFile(path.join(process.cwd(), "public", ...pending.capturedImagePath.split("/").filter(Boolean)));

  const record = await createHrvTestRecord({
    patientId,
    testDate: pending.measuredAt,
    vascularHealthIndex: pending.vascularHealthIndex,
    vascularHealthType: pending.vascularHealthType,
    avgPulse: pending.avgPulse,
    stressIndex: pending.stressIndex,
    imageBuffer,
    measuredByStaffId: staffUserId,
    tp: pending.tp,
    vlf: pending.vlf,
    lf: pending.lf,
    hf: pending.hf,
    lfHfRatio: pending.lfHfRatio,
    sdnn: pending.sdnn,
    rmssd: pending.rmssd,
    csvSourceKey: csvSourceKeyOf(pending.userName, pending.measuredAt),
  });

  await prisma.hrvImportPending.update({
    where: { id: pendingId },
    data: {
      status: "RESOLVED",
      resolvedPatientId: patientId,
      resolvedByStaffId: staffUserId,
      resolvedHrvTestRecordId: record.id,
      resolvedAt: new Date(),
    },
  });

  return { hrvTestRecordId: record.id };
}

/** 대기열 항목을 "무시"로만 표시한다 — 실제 검사기록으로 전환하지 않고 목록에서만 정리. */
export async function ignoreHrvImportPending(pendingId: number, staffUserId: number): Promise<void> {
  await prisma.hrvImportPending.update({
    where: { id: pendingId },
    data: { status: "IGNORED", resolvedByStaffId: staffUserId, resolvedAt: new Date() },
  });
}

export async function listHrvImportPending() {
  return prisma.hrvImportPending.findMany({
    where: { status: "PENDING" },
    orderBy: { measuredAt: "desc" },
  });
}
