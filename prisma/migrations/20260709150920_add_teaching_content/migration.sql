-- CreateTable
CREATE TABLE "TeachingContent" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "category" TEXT NOT NULL,
    "diseaseName" TEXT NOT NULL,
    "imagePathsJson" TEXT NOT NULL,
    "linkedProgramNote" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "PatientTeachingPage" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "token" TEXT NOT NULL,
    "patientId" INTEGER NOT NULL,
    "teachingContentId" INTEGER NOT NULL,
    "aiPersonalizedText" TEXT NOT NULL,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "firstViewedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByStaffId" INTEGER NOT NULL,
    "expiresAt" DATETIME,
    CONSTRAINT "PatientTeachingPage_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PatientTeachingPage_teachingContentId_fkey" FOREIGN KEY ("teachingContentId") REFERENCES "TeachingContent" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PatientTeachingPage_createdByStaffId_fkey" FOREIGN KEY ("createdByStaffId") REFERENCES "StaffUser" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "PatientTeachingPage_token_key" ON "PatientTeachingPage"("token");
