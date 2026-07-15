-- CreateTable
CREATE TABLE "HrvTestRecord" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "patientId" INTEGER NOT NULL,
    "testDate" DATETIME NOT NULL,
    "vascularHealthIndex" REAL NOT NULL,
    "vascularHealthType" TEXT NOT NULL,
    "avgPulse" REAL NOT NULL,
    "stressIndex" REAL NOT NULL,
    "sourceImagePath" TEXT NOT NULL,
    "aiCommentary" TEXT,
    "measuredByStaffId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HrvTestRecord_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "HrvTestRecord_measuredByStaffId_fkey" FOREIGN KEY ("measuredByStaffId") REFERENCES "StaffUser" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ExamAcademicGuide" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "examType" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "ExamAcademicGuide_examType_key" ON "ExamAcademicGuide"("examType");
