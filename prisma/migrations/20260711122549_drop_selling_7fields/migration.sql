-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ProgramTeaching" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "programName" TEXT NOT NULL,
    "targetSymptomKeywords" TEXT,
    "linkedTestType" TEXT,
    "patientSellingPoints" TEXT,
    "clinicSellingPoints" TEXT,
    "etcSellingPoints" TEXT,
    "academicDefinition" TEXT,
    "academicMechanism" TEXT,
    "academicEvidence" TEXT,
    "supportImagePath" TEXT,
    "ctaButtonLabel" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_ProgramTeaching" ("academicDefinition", "academicEvidence", "academicMechanism", "clinicSellingPoints", "createdAt", "ctaButtonLabel", "etcSellingPoints", "id", "isActive", "linkedTestType", "patientSellingPoints", "programName", "supportImagePath", "targetSymptomKeywords") SELECT "academicDefinition", "academicEvidence", "academicMechanism", "clinicSellingPoints", "createdAt", "ctaButtonLabel", "etcSellingPoints", "id", "isActive", "linkedTestType", "patientSellingPoints", "programName", "supportImagePath", "targetSymptomKeywords" FROM "ProgramTeaching";
DROP TABLE "ProgramTeaching";
ALTER TABLE "new_ProgramTeaching" RENAME TO "ProgramTeaching";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
