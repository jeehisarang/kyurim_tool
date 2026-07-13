-- CreateTable
CREATE TABLE "PatientShareLink" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "token" TEXT NOT NULL,
    "patientId" INTEGER NOT NULL,
    "teachingPageId" INTEGER,
    "eventImageId" INTEGER,
    "createdByStaffId" INTEGER NOT NULL,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "firstViewedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PatientShareLink_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PatientShareLink_teachingPageId_fkey" FOREIGN KEY ("teachingPageId") REFERENCES "PatientTeachingPage" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PatientShareLink_eventImageId_fkey" FOREIGN KEY ("eventImageId") REFERENCES "EventImage" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PatientShareLink_createdByStaffId_fkey" FOREIGN KEY ("createdByStaffId") REFERENCES "StaffUser" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "PatientShareLink_token_key" ON "PatientShareLink"("token");

-- CreateIndex
CREATE INDEX "PatientShareLink_patientId_teachingPageId_eventImageId_idx" ON "PatientShareLink"("patientId", "teachingPageId", "eventImageId");
