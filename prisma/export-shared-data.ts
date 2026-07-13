/**
 * 원장실PC↔집PC 콘텐츠 자산 동기화(task.md) — 내보내기.
 *
 * ProgramTeaching(프로그램티칭)/EventImage(이벤트이미지) 전체 레코드와 연결된 이미지
 * 파일을 shared-data/에 저장한다. 환자 데이터(dev.db 본체)는 건드리지 않는다 — 이 두
 * 모델만 "콘텐츠 자산" 성격이라 git으로 동기화 대상이다.
 *
 * 실행: npm run db:export-shared
 */
import "dotenv/config";
import { mkdir, copyFile, writeFile, readdir, unlink } from "fs/promises";
import path from "path";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../src/generated/prisma/client";

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL ?? "file:./dev.db",
});
const prisma = new PrismaClient({ adapter });

const SHARED_DATA_DIR = path.join(process.cwd(), "shared-data");
const SHARED_IMAGES_DIR = path.join(SHARED_DATA_DIR, "images");

// DB에 저장된 "/uploads/..." 공개경로를 실제 디스크 파일 경로로 변환
// (src/lib/image-upload.ts의 저장 규칙과 동일).
function publicPathToDiskPath(publicPath: string): string {
  return path.join(process.cwd(), "public", ...publicPath.split("/").filter(Boolean));
}

// 연결된 이미지가 있으면 shared-data/images/로 복사하고, JSON에 기록할 상대경로를 반환.
// 파일명은 syncKey 기반이라 재실행해도 항상 같은 이름으로 덮어써 파일이 쌓이지 않는다.
// DB엔 경로가 남아있지만 실제 파일이 디스크에 없는 경우(예: dev.db 복구 이력)는 건너뛰고
// 경고만 남긴다 — 이미지 1장 때문에 전체 내보내기가 중단되면 안 된다.
async function exportImage(publicPath: string | null, syncKey: string, label: string): Promise<string | null> {
  if (!publicPath) return null;
  const ext = path.extname(publicPath) || ".jpg";
  const filename = `${syncKey}_${label}${ext}`;
  try {
    await copyFile(publicPathToDiskPath(publicPath), path.join(SHARED_IMAGES_DIR, filename));
  } catch (err) {
    if (err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code === "ENOENT") {
      console.warn(`[경고] 이미지 파일을 찾을 수 없어 건너뜁니다: ${publicPath} (syncKey=${syncKey}, ${label})`);
      return null;
    }
    throw err;
  }
  return `shared-data/images/${filename}`;
}

async function main() {
  await mkdir(SHARED_IMAGES_DIR, { recursive: true });

  const programTeachings = await prisma.programTeaching.findMany({ orderBy: { id: "asc" } });
  const programTeachingExport = [];
  for (const pt of programTeachings) {
    const supportImagePath = await exportImage(pt.supportImagePath, pt.syncKey, "support");
    programTeachingExport.push({
      syncKey: pt.syncKey,
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
      createdAt: pt.createdAt,
    });
  }

  const eventImages = await prisma.eventImage.findMany({
    orderBy: { id: "asc" },
    include: { createdByStaff: { select: { name: true } } },
  });
  const eventImageExport = [];
  for (const ei of eventImages) {
    const backgroundImagePath = await exportImage(ei.backgroundImagePath, ei.syncKey, "background");
    const compositeImagePath = await exportImage(ei.compositeImagePath, ei.syncKey, "composite");
    eventImageExport.push({
      syncKey: ei.syncKey,
      rawIdea: ei.rawIdea,
      finalTitle: ei.finalTitle,
      finalCopy: ei.finalCopy,
      backgroundImagePath,
      compositeImagePath,
      // 두 PC의 StaffUser.id가 항상 같다는 보장이 없어(seed.ts 재실행 순서 등), 이름으로
      // 임포트 시 재매칭한다 — createdByStaffId(숫자)는 참고용으로만 같이 남겨둔다.
      createdByStaffName: ei.createdByStaff.name,
      isActive: ei.isActive,
      createdAt: ei.createdAt,
    });
  }

  await writeFile(
    path.join(SHARED_DATA_DIR, "program-teaching.json"),
    JSON.stringify(programTeachingExport, null, 2) + "\n",
  );
  await writeFile(
    path.join(SHARED_DATA_DIR, "event-images.json"),
    JSON.stringify(eventImageExport, null, 2) + "\n",
  );

  // 삭제된 레코드의 이미지 파일은 더 이상 어느 JSON에서도 참조되지 않는다 — 이번 내보내기
  // 결과에 없는 shared-data/images/ 파일은 고아 파일이므로 함께 정리한다(재실행할 때마다
  // 삭제된 레코드 이미지가 계속 쌓이는 것 방지).
  const referencedFilenames = new Set(
    [...programTeachingExport, ...eventImageExport]
      .flatMap((r) => [
        "supportImagePath" in r ? r.supportImagePath : null,
        "backgroundImagePath" in r ? r.backgroundImagePath : null,
        "compositeImagePath" in r ? r.compositeImagePath : null,
      ])
      .filter((p): p is string => p !== null)
      .map((p) => path.basename(p)),
  );
  const existingFiles = await readdir(SHARED_IMAGES_DIR);
  let prunedCount = 0;
  for (const filename of existingFiles) {
    if (!referencedFilenames.has(filename)) {
      await unlink(path.join(SHARED_IMAGES_DIR, filename));
      prunedCount++;
    }
  }

  console.log(
    `Exported ${programTeachingExport.length} ProgramTeaching, ${eventImageExport.length} EventImage record(s) to shared-data/.` +
      (prunedCount > 0 ? ` (고아 이미지 ${prunedCount}개 정리됨)` : ""),
  );
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
