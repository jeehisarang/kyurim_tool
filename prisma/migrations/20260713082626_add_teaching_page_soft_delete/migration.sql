-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_PatientTeachingPage" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "token" TEXT NOT NULL,
    "patientId" INTEGER NOT NULL,
    "programTeachingId" INTEGER NOT NULL,
    "snapshotTestValueJson" TEXT,
    "headline" TEXT NOT NULL,
    "personalSubtopic" TEXT NOT NULL,
    "bodyText" TEXT NOT NULL,
    "examSummary" TEXT,
    "academicHook" TEXT NOT NULL,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "firstViewedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByStaffId" INTEGER NOT NULL,
    "expiresAt" DATETIME,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "PatientTeachingPage_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PatientTeachingPage_programTeachingId_fkey" FOREIGN KEY ("programTeachingId") REFERENCES "ProgramTeaching" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PatientTeachingPage_createdByStaffId_fkey" FOREIGN KEY ("createdByStaffId") REFERENCES "StaffUser" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_PatientTeachingPage" ("academicHook", "bodyText", "createdAt", "createdByStaffId", "examSummary", "expiresAt", "firstViewedAt", "headline", "id", "patientId", "personalSubtopic", "programTeachingId", "snapshotTestValueJson", "token", "viewCount") SELECT "academicHook", "bodyText", "createdAt", "createdByStaffId", "examSummary", "expiresAt", "firstViewedAt", "headline", "id", "patientId", "personalSubtopic", "programTeachingId", "snapshotTestValueJson", "token", "viewCount" FROM "PatientTeachingPage";
DROP TABLE "PatientTeachingPage";
ALTER TABLE "new_PatientTeachingPage" RENAME TO "PatientTeachingPage";
CREATE UNIQUE INDEX "PatientTeachingPage_token_key" ON "PatientTeachingPage"("token");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
