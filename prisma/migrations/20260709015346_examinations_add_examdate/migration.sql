/*
  Warnings:

  - You are about to drop the column `measuredAt` on the `BodyCompositionRecord` table. All the data in the column will be lost.
  - You are about to drop the column `measuredAt` on the `StrengthTestRecord` table. All the data in the column will be lost.
  - Added the required column `examDate` to the `BodyCompositionRecord` table without a default value. This is not possible if the table is not empty.
  - Added the required column `examDate` to the `StrengthTestRecord` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_BodyCompositionRecord" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "patientId" INTEGER NOT NULL,
    "prescriptionId" INTEGER,
    "examDate" DATETIME NOT NULL,
    "weightKg" REAL NOT NULL,
    "bodyFatPercent" REAL NOT NULL,
    "whr" REAL NOT NULL,
    "armMuscleMassLeftKg" REAL,
    "armMuscleMassRightKg" REAL,
    "legMuscleMassLeftKg" REAL,
    "legMuscleMassRightKg" REAL,
    "limbMuscleMassKg" REAL,
    "smi" REAL,
    "smiJudgement" TEXT,
    "note" TEXT,
    "staffUserId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BodyCompositionRecord_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "BodyCompositionRecord_prescriptionId_fkey" FOREIGN KEY ("prescriptionId") REFERENCES "Prescription" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "BodyCompositionRecord_staffUserId_fkey" FOREIGN KEY ("staffUserId") REFERENCES "StaffUser" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_BodyCompositionRecord" ("armMuscleMassLeftKg", "armMuscleMassRightKg", "bodyFatPercent", "createdAt", "id", "legMuscleMassLeftKg", "legMuscleMassRightKg", "limbMuscleMassKg", "note", "patientId", "prescriptionId", "smi", "smiJudgement", "staffUserId", "weightKg", "whr") SELECT "armMuscleMassLeftKg", "armMuscleMassRightKg", "bodyFatPercent", "createdAt", "id", "legMuscleMassLeftKg", "legMuscleMassRightKg", "limbMuscleMassKg", "note", "patientId", "prescriptionId", "smi", "smiJudgement", "staffUserId", "weightKg", "whr" FROM "BodyCompositionRecord";
DROP TABLE "BodyCompositionRecord";
ALTER TABLE "new_BodyCompositionRecord" RENAME TO "BodyCompositionRecord";
CREATE TABLE "new_StrengthTestRecord" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "patientId" INTEGER NOT NULL,
    "prescriptionId" INTEGER,
    "examDate" DATETIME NOT NULL,
    "gender" TEXT NOT NULL,
    "measuredAge" INTEGER NOT NULL,
    "heightCm" REAL NOT NULL,
    "armMuscleMassLeftKg" REAL NOT NULL,
    "armMuscleMassRightKg" REAL NOT NULL,
    "legMuscleMassLeftKg" REAL NOT NULL,
    "legMuscleMassRightKg" REAL NOT NULL,
    "smi" REAL NOT NULL,
    "smiJudgement" TEXT NOT NULL,
    "gripLeftKg" REAL NOT NULL,
    "gripRightKg" REAL NOT NULL,
    "gripAvgKg" REAL NOT NULL,
    "gripJudgement" TEXT NOT NULL,
    "staffUserId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StrengthTestRecord_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StrengthTestRecord_prescriptionId_fkey" FOREIGN KEY ("prescriptionId") REFERENCES "Prescription" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "StrengthTestRecord_staffUserId_fkey" FOREIGN KEY ("staffUserId") REFERENCES "StaffUser" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_StrengthTestRecord" ("armMuscleMassLeftKg", "armMuscleMassRightKg", "createdAt", "gender", "gripAvgKg", "gripJudgement", "gripLeftKg", "gripRightKg", "heightCm", "id", "legMuscleMassLeftKg", "legMuscleMassRightKg", "measuredAge", "patientId", "prescriptionId", "smi", "smiJudgement", "staffUserId") SELECT "armMuscleMassLeftKg", "armMuscleMassRightKg", "createdAt", "gender", "gripAvgKg", "gripJudgement", "gripLeftKg", "gripRightKg", "heightCm", "id", "legMuscleMassLeftKg", "legMuscleMassRightKg", "measuredAge", "patientId", "prescriptionId", "smi", "smiJudgement", "staffUserId" FROM "StrengthTestRecord";
DROP TABLE "StrengthTestRecord";
ALTER TABLE "new_StrengthTestRecord" RENAME TO "StrengthTestRecord";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
