-- CreateTable
CREATE TABLE "HrvImportPending" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userName" TEXT NOT NULL,
    "gender" TEXT,
    "birthYear" INTEGER,
    "age" INTEGER,
    "rawChartNumber" TEXT,
    "measuredAt" DATETIME NOT NULL,
    "vascularHealthIndex" REAL,
    "vascularHealthType" TEXT,
    "avgPulse" REAL,
    "stressIndex" REAL,
    "tp" REAL,
    "vlf" REAL,
    "lf" REAL,
    "hf" REAL,
    "lfHfRatio" REAL,
    "sdnn" REAL,
    "rmssd" REAL,
    "capturedImagePath" TEXT,
    "sourceFile" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "resolvedPatientId" INTEGER,
    "resolvedByStaffId" INTEGER,
    "resolvedHrvTestRecordId" INTEGER,
    "resolvedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HrvImportPending_resolvedPatientId_fkey" FOREIGN KEY ("resolvedPatientId") REFERENCES "Patient" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "HrvImportPending_resolvedByStaffId_fkey" FOREIGN KEY ("resolvedByStaffId") REFERENCES "StaffUser" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_HrvTestRecord" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "patientId" INTEGER NOT NULL,
    "testDate" DATETIME NOT NULL,
    "vascularHealthIndex" REAL NOT NULL,
    "vascularHealthType" TEXT NOT NULL,
    "avgPulse" REAL NOT NULL,
    "stressIndex" REAL,
    "tp" REAL,
    "vlf" REAL,
    "lf" REAL,
    "hf" REAL,
    "lfHfRatio" REAL,
    "sdnn" REAL,
    "rmssd" REAL,
    "sourceImagePath" TEXT NOT NULL,
    "sourceImagePath2" TEXT,
    "aiCommentary" TEXT,
    "aiDeviceReading" TEXT,
    "aiClinicalMeaning" TEXT,
    "aiLifestyleGuide" TEXT,
    "aiTcmInterpretation" TEXT,
    "aiCommentaryVersion" TEXT,
    "measuredByStaffId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "csvSourceKey" TEXT,
    CONSTRAINT "HrvTestRecord_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "HrvTestRecord_measuredByStaffId_fkey" FOREIGN KEY ("measuredByStaffId") REFERENCES "StaffUser" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_HrvTestRecord" ("aiClinicalMeaning", "aiCommentary", "aiCommentaryVersion", "aiDeviceReading", "aiLifestyleGuide", "aiTcmInterpretation", "avgPulse", "createdAt", "id", "isActive", "measuredByStaffId", "patientId", "sourceImagePath", "sourceImagePath2", "stressIndex", "testDate", "vascularHealthIndex", "vascularHealthType") SELECT "aiClinicalMeaning", "aiCommentary", "aiCommentaryVersion", "aiDeviceReading", "aiLifestyleGuide", "aiTcmInterpretation", "avgPulse", "createdAt", "id", "isActive", "measuredByStaffId", "patientId", "sourceImagePath", "sourceImagePath2", "stressIndex", "testDate", "vascularHealthIndex", "vascularHealthType" FROM "HrvTestRecord";
DROP TABLE "HrvTestRecord";
ALTER TABLE "new_HrvTestRecord" RENAME TO "HrvTestRecord";
CREATE UNIQUE INDEX "HrvTestRecord_csvSourceKey_key" ON "HrvTestRecord"("csvSourceKey");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "HrvImportPending_userName_measuredAt_key" ON "HrvImportPending"("userName", "measuredAt");
