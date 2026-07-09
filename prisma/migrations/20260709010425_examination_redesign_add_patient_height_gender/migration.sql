/*
  Warnings:

  - Added the required column `bodyFatPercent` to the `BodyCompositionRecord` table without a default value. This is not possible if the table is not empty.
  - Added the required column `whr` to the `BodyCompositionRecord` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Patient" ADD COLUMN "gender" TEXT;
ALTER TABLE "Patient" ADD COLUMN "height" REAL;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_BodyCompositionRecord" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "patientId" INTEGER NOT NULL,
    "prescriptionId" INTEGER,
    "measuredAt" DATETIME NOT NULL,
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
INSERT INTO "new_BodyCompositionRecord" ("createdAt", "id", "measuredAt", "note", "patientId", "prescriptionId", "staffUserId", "weightKg") SELECT "createdAt", "id", "measuredAt", "note", "patientId", "prescriptionId", "staffUserId", "weightKg" FROM "BodyCompositionRecord";
DROP TABLE "BodyCompositionRecord";
ALTER TABLE "new_BodyCompositionRecord" RENAME TO "BodyCompositionRecord";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
