-- 원장실PC↔집PC 콘텐츠 자산 동기화(task.md)용 syncKey 추가.
-- prisma-level 기본값(cuid())은 SQLite에 정적 SQL DEFAULT로 내릴 수 없어(신규 로우는
-- Prisma Client가 채워줌), 기존 로우 백필은 여기서 randomblob 기반 고유값으로 직접 채운다
-- (lower(hex(randomblob(16)))는 32자리 16진 문자열 — 로우마다 다른 값이라 곧바로 NOT NULL +
-- UNIQUE 제약을 만족한다).
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_EventImage" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "syncKey" TEXT NOT NULL,
    "rawIdea" TEXT NOT NULL,
    "finalTitle" TEXT NOT NULL,
    "finalCopy" TEXT NOT NULL,
    "backgroundImagePath" TEXT NOT NULL,
    "compositeImagePath" TEXT NOT NULL,
    "createdByStaffId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "EventImage_createdByStaffId_fkey" FOREIGN KEY ("createdByStaffId") REFERENCES "StaffUser" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_EventImage" ("id", "syncKey", "rawIdea", "finalTitle", "finalCopy", "backgroundImagePath", "compositeImagePath", "createdByStaffId", "createdAt", "isActive")
SELECT "id", lower(hex(randomblob(16))), "rawIdea", "finalTitle", "finalCopy", "backgroundImagePath", "compositeImagePath", "createdByStaffId", "createdAt", "isActive" FROM "EventImage";
DROP TABLE "EventImage";
ALTER TABLE "new_EventImage" RENAME TO "EventImage";
CREATE UNIQUE INDEX "EventImage_syncKey_key" ON "EventImage"("syncKey");
CREATE TABLE "new_ProgramTeaching" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "syncKey" TEXT NOT NULL,
    "programName" TEXT NOT NULL,
    "targetSymptomKeywords" TEXT,
    "linkedTestType" TEXT,
    "patientSellingPoints" TEXT,
    "clinicSellingPoints" TEXT,
    "etcSellingPoints" TEXT,
    "academicDefinition" TEXT,
    "academicMechanism" TEXT,
    "academicEvidence" TEXT,
    "supportImagePath" TEXT,
    "ctaButtonLabel" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_ProgramTeaching" ("id", "syncKey", "programName", "targetSymptomKeywords", "linkedTestType", "patientSellingPoints", "clinicSellingPoints", "etcSellingPoints", "academicDefinition", "academicMechanism", "academicEvidence", "supportImagePath", "ctaButtonLabel", "isActive", "createdAt")
SELECT "id", lower(hex(randomblob(16))), "programName", "targetSymptomKeywords", "linkedTestType", "patientSellingPoints", "clinicSellingPoints", "etcSellingPoints", "academicDefinition", "academicMechanism", "academicEvidence", "supportImagePath", "ctaButtonLabel", "isActive", "createdAt" FROM "ProgramTeaching";
DROP TABLE "ProgramTeaching";
ALTER TABLE "new_ProgramTeaching" RENAME TO "ProgramTeaching";
CREATE UNIQUE INDEX "ProgramTeaching_syncKey_key" ON "ProgramTeaching"("syncKey");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
