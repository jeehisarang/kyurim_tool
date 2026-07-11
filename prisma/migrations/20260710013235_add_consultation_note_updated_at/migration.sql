/*
  Warnings:

  - Added the required column `updatedAt` to the `ConsultationNote` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ConsultationNote" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "patientId" INTEGER NOT NULL,
    "visitDate" DATETIME NOT NULL,
    "consultationTypeId" INTEGER NOT NULL,
    "rawText" TEXT NOT NULL,
    "convertedChartText" TEXT,
    "createdByStaffId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ConsultationNote_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ConsultationNote_consultationTypeId_fkey" FOREIGN KEY ("consultationTypeId") REFERENCES "ConsultationType" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ConsultationNote_createdByStaffId_fkey" FOREIGN KEY ("createdByStaffId") REFERENCES "StaffUser" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
-- 기존 행(수정 전)의 updatedAt은 createdAt과 동일하게 백필한다 — 아직 한 번도 수정 안 한 것과 동일한 의미.
INSERT INTO "new_ConsultationNote" ("consultationTypeId", "convertedChartText", "createdAt", "createdByStaffId", "id", "patientId", "rawText", "visitDate", "updatedAt") SELECT "consultationTypeId", "convertedChartText", "createdAt", "createdByStaffId", "id", "patientId", "rawText", "visitDate", "createdAt" FROM "ConsultationNote";
DROP TABLE "ConsultationNote";
ALTER TABLE "new_ConsultationNote" RENAME TO "ConsultationNote";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
