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
    "measuredByStaffId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "csvSourceKey" TEXT,
    CONSTRAINT "HrvTestRecord_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "HrvTestRecord_measuredByStaffId_fkey" FOREIGN KEY ("measuredByStaffId") REFERENCES "StaffUser" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_HrvTestRecord" ("aiClinicalMeaning", "aiCommentary", "aiCommentaryVersion", "aiDeviceReading", "aiLifestyleGuide", "aiTcmInterpretation", "avgPulse", "createdAt", "csvSourceKey", "hf", "id", "isActive", "lf", "lfHfRatio", "measuredByStaffId", "patientId", "rmssd", "sdnn", "sourceImagePath", "sourceImagePath2", "stressIndex", "testDate", "tp", "vascularHealthIndex", "vascularHealthType", "vlf") SELECT "aiClinicalMeaning", "aiCommentary", "aiCommentaryVersion", "aiDeviceReading", "aiLifestyleGuide", "aiTcmInterpretation", "avgPulse", "createdAt", "csvSourceKey", "hf", "id", "isActive", "lf", "lfHfRatio", "measuredByStaffId", "patientId", "rmssd", "sdnn", "sourceImagePath", "sourceImagePath2", "stressIndex", "testDate", "tp", "vascularHealthIndex", "vascularHealthType", "vlf" FROM "HrvTestRecord";
DROP TABLE "HrvTestRecord";
ALTER TABLE "new_HrvTestRecord" RENAME TO "HrvTestRecord";
CREATE UNIQUE INDEX "HrvTestRecord_csvSourceKey_key" ON "HrvTestRecord"("csvSourceKey");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
