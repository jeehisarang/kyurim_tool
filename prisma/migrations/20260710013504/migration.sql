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
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ConsultationNote_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ConsultationNote_consultationTypeId_fkey" FOREIGN KEY ("consultationTypeId") REFERENCES "ConsultationType" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ConsultationNote_createdByStaffId_fkey" FOREIGN KEY ("createdByStaffId") REFERENCES "StaffUser" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_ConsultationNote" ("consultationTypeId", "convertedChartText", "createdAt", "createdByStaffId", "id", "patientId", "rawText", "updatedAt", "visitDate") SELECT "consultationTypeId", "convertedChartText", "createdAt", "createdByStaffId", "id", "patientId", "rawText", "updatedAt", "visitDate" FROM "ConsultationNote";
DROP TABLE "ConsultationNote";
ALTER TABLE "new_ConsultationNote" RENAME TO "ConsultationNote";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
