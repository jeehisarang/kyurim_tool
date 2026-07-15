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
    "aiExplanation" TEXT,
    "staffUserId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "BodyCompositionRecord_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "BodyCompositionRecord_prescriptionId_fkey" FOREIGN KEY ("prescriptionId") REFERENCES "Prescription" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "BodyCompositionRecord_staffUserId_fkey" FOREIGN KEY ("staffUserId") REFERENCES "StaffUser" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_BodyCompositionRecord" ("aiExplanation", "armMuscleMassLeftKg", "armMuscleMassRightKg", "bodyFatPercent", "createdAt", "examDate", "id", "legMuscleMassLeftKg", "legMuscleMassRightKg", "limbMuscleMassKg", "note", "patientId", "prescriptionId", "smi", "smiJudgement", "staffUserId", "weightKg", "whr") SELECT "aiExplanation", "armMuscleMassLeftKg", "armMuscleMassRightKg", "bodyFatPercent", "createdAt", "examDate", "id", "legMuscleMassLeftKg", "legMuscleMassRightKg", "limbMuscleMassKg", "note", "patientId", "prescriptionId", "smi", "smiJudgement", "staffUserId", "weightKg", "whr" FROM "BodyCompositionRecord";
DROP TABLE "BodyCompositionRecord";
ALTER TABLE "new_BodyCompositionRecord" RENAME TO "BodyCompositionRecord";
CREATE TABLE "new_HrvTestRecord" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "patientId" INTEGER NOT NULL,
    "testDate" DATETIME NOT NULL,
    "vascularHealthIndex" REAL NOT NULL,
    "vascularHealthType" TEXT NOT NULL,
    "avgPulse" REAL NOT NULL,
    "stressIndex" REAL NOT NULL,
    "sourceImagePath" TEXT NOT NULL,
    "sourceImagePath2" TEXT,
    "aiCommentary" TEXT,
    "aiDeviceReading" TEXT,
    "aiClinicalMeaning" TEXT,
    "aiLifestyleGuide" TEXT,
    "aiTcmInterpretation" TEXT,
    "measuredByStaffId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "HrvTestRecord_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "HrvTestRecord_measuredByStaffId_fkey" FOREIGN KEY ("measuredByStaffId") REFERENCES "StaffUser" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_HrvTestRecord" ("aiClinicalMeaning", "aiCommentary", "aiDeviceReading", "aiLifestyleGuide", "aiTcmInterpretation", "avgPulse", "createdAt", "id", "measuredByStaffId", "patientId", "sourceImagePath", "sourceImagePath2", "stressIndex", "testDate", "vascularHealthIndex", "vascularHealthType") SELECT "aiClinicalMeaning", "aiCommentary", "aiDeviceReading", "aiLifestyleGuide", "aiTcmInterpretation", "avgPulse", "createdAt", "id", "measuredByStaffId", "patientId", "sourceImagePath", "sourceImagePath2", "stressIndex", "testDate", "vascularHealthIndex", "vascularHealthType" FROM "HrvTestRecord";
DROP TABLE "HrvTestRecord";
ALTER TABLE "new_HrvTestRecord" RENAME TO "HrvTestRecord";
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
    "aiExplanation" TEXT,
    "staffUserId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "StrengthTestRecord_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StrengthTestRecord_prescriptionId_fkey" FOREIGN KEY ("prescriptionId") REFERENCES "Prescription" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "StrengthTestRecord_staffUserId_fkey" FOREIGN KEY ("staffUserId") REFERENCES "StaffUser" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_StrengthTestRecord" ("aiExplanation", "createdAt", "estimatedGripAge", "examDate", "gripAgeOutOfRange", "gripAvgKg", "gripJudgement", "gripLeftKg", "gripRightKg", "id", "measuredAge", "patientId", "prescriptionId", "staffUserId") SELECT "aiExplanation", "createdAt", "estimatedGripAge", "examDate", "gripAgeOutOfRange", "gripAvgKg", "gripJudgement", "gripLeftKg", "gripRightKg", "id", "measuredAge", "patientId", "prescriptionId", "staffUserId" FROM "StrengthTestRecord";
DROP TABLE "StrengthTestRecord";
ALTER TABLE "new_StrengthTestRecord" RENAME TO "StrengthTestRecord";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
