/**
 * 원장실PC↔집PC 콘텐츠 자산 동기화(task.md) — 가져오기.
 *
 * shared-data/program-teaching.json, shared-data/event-images.json을 syncKey 기준으로
 * upsert한다. JSON에 없는 로컬 레코드는 절대 건드리지 않는다(삭제 동기화 없음, 삭제는
 * 각 PC에서 수동으로) — 로컬에서만 만든 테스트 데이터가 실수로 지워지지 않게 하기 위함.
 *
 * 실행: npm run db:import-shared
 */
import "dotenv/config";
import { mkdir, copyFile, readFile } from "fs/promises";
import path from "path";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../src/generated/prisma/client";

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL ?? "file:./dev.db",
});
const prisma = new PrismaClient({ adapter });

const SHARED_DATA_DIR = path.join(process.cwd(), "shared-data");
const TEACHING_UPLOAD_DIR = path.join(process.cwd(), "public", "uploads", "teaching");
const EVENT_UPLOAD_DIR = path.join(process.cwd(), "public", "uploads", "event-image");

type ProgramTeachingRecord = {
  syncKey: string;
  programName: string;
  targetSymptomKeywords: string | null;
  linkedTestType: string | null;
  patientSellingPoints: string | null;
  clinicSellingPoints: string | null;
  etcSellingPoints: string | null;
  academicDefinition: string | null;
  academicMechanism: string | null;
  academicEvidence: string | null;
  supportImagePath: string | null;
  ctaButtonLabel: string | null;
  isActive: boolean;
  createdAt: string;
};

type EventImageRecord = {
  syncKey: string;
  rawIdea: string;
  finalTitle: string;
  finalCopy: string;
  backgroundImagePath: string | null;
  compositeImagePath: string | null;
  createdByStaffName: string;
  isActive: boolean;
  createdAt: string;
};

async function readJsonFile<T>(filename: string): Promise<T[] | null> {
  try {
    const raw = await readFile(path.join(SHARED_DATA_DIR, filename), "utf-8");
    return JSON.parse(raw) as T[];
  } catch (err) {
    if (err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw err;
  }
}

// shared-data/images/의 상대경로를 실제 서비스 업로드 폴더로 복사하고, DB에 저장할
// "/uploads/..." 공개경로를 반환한다. 파일명은 syncKey 기반이라 재실행해도 항상 같은
// 파일을 덮어쓴다(누적되지 않음).
async function importImage(
  relativePath: string | null,
  uploadDir: string,
  publicPrefix: string,
  syncKey: string,
  label: string,
): Promise<string | null> {
  if (!relativePath) return null;
  const ext = path.extname(relativePath) || ".jpg";
  const filename = `sync-${syncKey}-${label}${ext}`;
  await mkdir(uploadDir, { recursive: true });
  await copyFile(path.join(process.cwd(), relativePath), path.join(uploadDir, filename));
  return `${publicPrefix}/${filename}`;
}

async function importProgramTeachings(records: ProgramTeachingRecord[]) {
  let created = 0;
  let updated = 0;
  for (const pt of records) {
    const supportImagePath = await importImage(
      pt.supportImagePath,
      TEACHING_UPLOAD_DIR,
      "/uploads/teaching",
      pt.syncKey,
      "support",
    );
    const data = {
      programName: pt.programName,
      targetSymptomKeywords: pt.targetSymptomKeywords,
      linkedTestType: pt.linkedTestType,
      patientSellingPoints: pt.patientSellingPoints,
      clinicSellingPoints: pt.clinicSellingPoints,
      etcSellingPoints: pt.etcSellingPoints,
      academicDefinition: pt.academicDefinition,
      academicMechanism: pt.academicMechanism,
      academicEvidence: pt.academicEvidence,
      supportImagePath,
      ctaButtonLabel: pt.ctaButtonLabel,
      isActive: pt.isActive,
    };
    const existing = await prisma.programTeaching.findUnique({ where: { syncKey: pt.syncKey } });
    await prisma.programTeaching.upsert({
      where: { syncKey: pt.syncKey },
      update: data,
      create: { ...data, syncKey: pt.syncKey, createdAt: new Date(pt.createdAt) },
    });
    if (existing) updated++;
    else created++;
  }
  console.log(`ProgramTeaching: ${created}건 생성, ${updated}건 갱신.`);
}

async function importEventImages(records: EventImageRecord[]) {
  let created = 0;
  let updated = 0;
  for (const ei of records) {
    const staff = await prisma.staffUser.findFirst({ where: { name: ei.createdByStaffName } });
    if (!staff) {
      throw new Error(
        `EventImage(syncKey=${ei.syncKey})의 작성자 "${ei.createdByStaffName}"를 이 PC의 StaffUser에서 찾을 수 없습니다. ` +
          `먼저 npm run db:seed로 기본 직원 목록을 맞춘 뒤 다시 시도하세요.`,
      );
    }

    // backgroundImagePath/compositeImagePath는 스키마상 필수(non-null) 필드라 export 시 항상 채워진다.
    const backgroundImagePath = await importImage(
      ei.backgroundImagePath,
      EVENT_UPLOAD_DIR,
      "/uploads/event-image",
      ei.syncKey,
      "background",
    );
    const compositeImagePath = await importImage(
      ei.compositeImagePath,
      EVENT_UPLOAD_DIR,
      "/uploads/event-image",
      ei.syncKey,
      "composite",
    );
    const data = {
      rawIdea: ei.rawIdea,
      finalTitle: ei.finalTitle,
      finalCopy: ei.finalCopy,
      backgroundImagePath: backgroundImagePath as string,
      compositeImagePath: compositeImagePath as string,
      createdByStaffId: staff.id,
      isActive: ei.isActive,
    };
    const existing = await prisma.eventImage.findUnique({ where: { syncKey: ei.syncKey } });
    await prisma.eventImage.upsert({
      where: { syncKey: ei.syncKey },
      update: data,
      create: { ...data, syncKey: ei.syncKey, createdAt: new Date(ei.createdAt) },
    });
    if (existing) updated++;
    else created++;
  }
  console.log(`EventImage: ${created}건 생성, ${updated}건 갱신.`);
}

async function main() {
  const programTeachings = await readJsonFile<ProgramTeachingRecord>("program-teaching.json");
  const eventImages = await readJsonFile<EventImageRecord>("event-images.json");

  if (!programTeachings && !eventImages) {
    console.log("shared-data/ 에 내보내진 파일이 없습니다 — 다른 PC에서 npm run db:export-shared 후 git pull 했는지 확인하세요.");
    return;
  }

  if (programTeachings) await importProgramTeachings(programTeachings);
  if (eventImages) await importEventImages(eventImages);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
