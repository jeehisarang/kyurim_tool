-- CreateTable
CREATE TABLE "PatientShareLinkExam" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "shareLinkId" INTEGER NOT NULL,
    "examType" TEXT NOT NULL,
    "examRecordId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PatientShareLinkExam_shareLinkId_fkey" FOREIGN KEY ("shareLinkId") REFERENCES "PatientShareLink" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "PatientShareLinkExam_shareLinkId_idx" ON "PatientShareLinkExam"("shareLinkId");

-- CreateIndex
CREATE INDEX "PatientShareLinkExam_examType_examRecordId_idx" ON "PatientShareLinkExam"("examType", "examRecordId");
