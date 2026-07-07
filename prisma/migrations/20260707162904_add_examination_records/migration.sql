-- CreateTable
CREATE TABLE "BodyCompositionRecord" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "patientId" INTEGER NOT NULL,
    "prescriptionId" INTEGER,
    "measuredAt" DATETIME NOT NULL,
    "weightKg" REAL NOT NULL,
    "note" TEXT,
    "staffUserId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BodyCompositionRecord_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "BodyCompositionRecord_prescriptionId_fkey" FOREIGN KEY ("prescriptionId") REFERENCES "Prescription" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "BodyCompositionRecord_staffUserId_fkey" FOREIGN KEY ("staffUserId") REFERENCES "StaffUser" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StrengthTestRecord" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "patientId" INTEGER NOT NULL,
    "prescriptionId" INTEGER,
    "measuredAt" DATETIME NOT NULL,
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
