-- CreateTable
CREATE TABLE "TcmCategory" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "categoryCode" TEXT NOT NULL,
    "patientLabel" TEXT NOT NULL,
    "treatmentPrinciple" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "TcmChecklistQuestion" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "categoryId" INTEGER NOT NULL,
    "questionCode" TEXT NOT NULL,
    "patientQuestion" TEXT NOT NULL,
    "weight" INTEGER NOT NULL DEFAULT 1,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TcmChecklistQuestion_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "TcmCategory" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TcmChecklistResponse" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "patientId" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "shareLinkId" INTEGER,
    "submittedByStaffId" INTEGER,
    "otherSymptomsText" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TcmChecklistResponse_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TcmChecklistResponse_shareLinkId_fkey" FOREIGN KEY ("shareLinkId") REFERENCES "PatientShareLink" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TcmChecklistResponse_submittedByStaffId_fkey" FOREIGN KEY ("submittedByStaffId") REFERENCES "StaffUser" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TcmChecklistAnswer" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "responseId" INTEGER NOT NULL,
    "questionId" INTEGER NOT NULL,
    "score" INTEGER NOT NULL,
    CONSTRAINT "TcmChecklistAnswer_responseId_fkey" FOREIGN KEY ("responseId") REFERENCES "TcmChecklistResponse" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TcmChecklistAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "TcmChecklistQuestion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TcmCategoryScore" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "responseId" INTEGER NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "rawScore" INTEGER NOT NULL,
    "maxScore" INTEGER NOT NULL,
    "ratio" REAL NOT NULL,
    "isCandidate" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "TcmCategoryScore_responseId_fkey" FOREIGN KEY ("responseId") REFERENCES "TcmChecklistResponse" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TcmCategoryScore_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "TcmCategory" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "TcmCategory_categoryCode_key" ON "TcmCategory"("categoryCode");

-- CreateIndex
CREATE UNIQUE INDEX "TcmChecklistQuestion_questionCode_key" ON "TcmChecklistQuestion"("questionCode");

-- CreateIndex
CREATE INDEX "TcmChecklistQuestion_categoryId_idx" ON "TcmChecklistQuestion"("categoryId");

-- CreateIndex
CREATE INDEX "TcmChecklistResponse_patientId_idx" ON "TcmChecklistResponse"("patientId");

-- CreateIndex
CREATE UNIQUE INDEX "TcmChecklistAnswer_responseId_questionId_key" ON "TcmChecklistAnswer"("responseId", "questionId");

-- CreateIndex
CREATE UNIQUE INDEX "TcmCategoryScore_responseId_categoryId_key" ON "TcmCategoryScore"("responseId", "categoryId");
