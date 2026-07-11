/*
  Warnings:

  - You are about to drop the `TeachingContent` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the column `teachingContentId` on the `PatientTeachingPage` table. All the data in the column will be lost.
  - Added the required column `programTeachingId` to the `PatientTeachingPage` table without a default value. This is not possible if the table is not empty.

*/
-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "TeachingContent";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "ProgramTeaching" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "programName" TEXT NOT NULL,
    "targetSymptomKeywords" TEXT,
    "linkedTestType" TEXT,
    "reasoningTemplate" TEXT NOT NULL,
    "supportImagePath" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_PatientTeachingPage" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "token" TEXT NOT NULL,
    "patientId" INTEGER NOT NULL,
    "programTeachingId" INTEGER NOT NULL,
    "snapshotTestValueJson" TEXT,
    "aiPersonalizedText" TEXT NOT NULL,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "firstViewedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByStaffId" INTEGER NOT NULL,
    "expiresAt" DATETIME,
    CONSTRAINT "PatientTeachingPage_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PatientTeachingPage_programTeachingId_fkey" FOREIGN KEY ("programTeachingId") REFERENCES "ProgramTeaching" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PatientTeachingPage_createdByStaffId_fkey" FOREIGN KEY ("createdByStaffId") REFERENCES "StaffUser" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_PatientTeachingPage" ("aiPersonalizedText", "createdAt", "createdByStaffId", "expiresAt", "firstViewedAt", "id", "patientId", "token", "viewCount") SELECT "aiPersonalizedText", "createdAt", "createdByStaffId", "expiresAt", "firstViewedAt", "id", "patientId", "token", "viewCount" FROM "PatientTeachingPage";
DROP TABLE "PatientTeachingPage";
ALTER TABLE "new_PatientTeachingPage" RENAME TO "PatientTeachingPage";
CREATE UNIQUE INDEX "PatientTeachingPage_token_key" ON "PatientTeachingPage"("token");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
