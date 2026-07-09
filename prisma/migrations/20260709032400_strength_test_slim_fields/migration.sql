/*
  Warnings:

  - You are about to drop the column `armMuscleMassLeftKg` on the `StrengthTestRecord` table. All the data in the column will be lost.
  - You are about to drop the column `armMuscleMassRightKg` on the `StrengthTestRecord` table. All the data in the column will be lost.
  - You are about to drop the column `heightCm` on the `StrengthTestRecord` table. All the data in the column will be lost.
  - You are about to drop the column `legMuscleMassLeftKg` on the `StrengthTestRecord` table. All the data in the column will be lost.
  - You are about to drop the column `legMuscleMassRightKg` on the `StrengthTestRecord` table. All the data in the column will be lost.
  - You are about to drop the column `smi` on the `StrengthTestRecord` table. All the data in the column will be lost.
  - You are about to drop the column `smiJudgement` on the `StrengthTestRecord` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_StrengthTestRecord" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "patientId" INTEGER NOT NULL,
    "prescriptionId" INTEGER,
    "examDate" DATETIME NOT NULL,
    "measuredAge" INTEGER NOT NULL,
    "gripLeftKg" REAL NOT NULL,
    "gripRightKg" REAL NOT NULL,
    "gripAvgKg" REAL NOT NULL,
    "gripJudgement" TEXT NOT NULL,
    "estimatedGripAge" INTEGER,
    "gripAgeOutOfRange" TEXT,
    "staffUserId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StrengthTestRecord_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StrengthTestRecord_prescriptionId_fkey" FOREIGN KEY ("prescriptionId") REFERENCES "Prescription" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "StrengthTestRecord_staffUserId_fkey" FOREIGN KEY ("staffUserId") REFERENCES "StaffUser" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_StrengthTestRecord" ("createdAt", "estimatedGripAge", "examDate", "gripAgeOutOfRange", "gripAvgKg", "gripJudgement", "gripLeftKg", "gripRightKg", "id", "measuredAge", "patientId", "prescriptionId", "staffUserId") SELECT "createdAt", "estimatedGripAge", "examDate", "gripAgeOutOfRange", "gripAvgKg", "gripJudgement", "gripLeftKg", "gripRightKg", "id", "measuredAge", "patientId", "prescriptionId", "staffUserId" FROM "StrengthTestRecord";
DROP TABLE "StrengthTestRecord";
ALTER TABLE "new_StrengthTestRecord" RENAME TO "StrengthTestRecord";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
