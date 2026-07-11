/*
  Warnings:

  - You are about to drop the column `reasoningTemplate` on the `ProgramTeaching` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ProgramTeaching" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "programName" TEXT NOT NULL,
    "targetSymptomKeywords" TEXT,
    "linkedTestType" TEXT,
    "sellingAccessCost" TEXT,
    "sellingConvenience" TEXT,
    "sellingDifferentiation" TEXT,
    "sellingEffectiveness" TEXT,
    "sellingSafety" TEXT,
    "sellingLifestyleFit" TEXT,
    "sellingOther" TEXT,
    "academicDefinition" TEXT,
    "academicMechanism" TEXT,
    "academicEvidence" TEXT,
    "supportImagePath" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_ProgramTeaching" ("createdAt", "id", "isActive", "linkedTestType", "programName", "supportImagePath", "targetSymptomKeywords") SELECT "createdAt", "id", "isActive", "linkedTestType", "programName", "supportImagePath", "targetSymptomKeywords" FROM "ProgramTeaching";
DROP TABLE "ProgramTeaching";
ALTER TABLE "new_ProgramTeaching" RENAME TO "ProgramTeaching";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
