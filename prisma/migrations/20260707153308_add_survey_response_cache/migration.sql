-- CreateTable
CREATE TABLE "SurveyResponseCache" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "sourceRowId" TEXT NOT NULL,
    "respondentName" TEXT NOT NULL,
    "respondentPhone" TEXT NOT NULL,
    "rawDataJson" TEXT NOT NULL,
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "linkedPrescriptionId" TEXT
);

-- CreateIndex
CREATE UNIQUE INDEX "SurveyResponseCache_sourceRowId_key" ON "SurveyResponseCache"("sourceRowId");
