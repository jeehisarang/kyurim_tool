-- AlterTable
ALTER TABLE "Prescription" ADD COLUMN "surveyDataJson" TEXT;

-- CreateTable
CREATE TABLE "ProgramEventTemplate" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "programId" INTEGER NOT NULL,
    "taskType" TEXT NOT NULL,
    "offsetDays" INTEGER NOT NULL,
    "generationType" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProgramEventTemplate_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProgramEventLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "todoTaskId" INTEGER NOT NULL,
    "sentDate" DATETIME,
    "staffUserId" INTEGER,
    "skippedAt" DATETIME,
    "skippedByUserId" INTEGER,
    "patientMessage" TEXT,
    "internalAnalysis" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProgramEventLog_todoTaskId_fkey" FOREIGN KEY ("todoTaskId") REFERENCES "TodoTask" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ProgramEventLog_staffUserId_fkey" FOREIGN KEY ("staffUserId") REFERENCES "StaffUser" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ProgramEventLog_skippedByUserId_fkey" FOREIGN KEY ("skippedByUserId") REFERENCES "StaffUser" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ProgramEventTemplate_programId_taskType_key" ON "ProgramEventTemplate"("programId", "taskType");

-- CreateIndex
CREATE UNIQUE INDEX "ProgramEventLog_todoTaskId_key" ON "ProgramEventLog"("todoTaskId");
