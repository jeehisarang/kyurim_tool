-- CreateTable
CREATE TABLE "ExamReminderCycle" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "patientId" INTEGER NOT NULL,
    "examType" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastExamDate" DATETIME NOT NULL,
    "nextDueDate" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ExamReminderCycle_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_TodoTask" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "prescriptionId" INTEGER,
    "patientId" INTEGER,
    "taskType" TEXT NOT NULL,
    "dueDate" DATETIME,
    "staffUserId" INTEGER,
    "isDone" BOOLEAN NOT NULL DEFAULT false,
    "doneByUserId" INTEGER,
    "doneAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "examReminderCycleId" INTEGER,
    CONSTRAINT "TodoTask_prescriptionId_fkey" FOREIGN KEY ("prescriptionId") REFERENCES "Prescription" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TodoTask_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TodoTask_staffUserId_fkey" FOREIGN KEY ("staffUserId") REFERENCES "StaffUser" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TodoTask_doneByUserId_fkey" FOREIGN KEY ("doneByUserId") REFERENCES "StaffUser" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TodoTask_examReminderCycleId_fkey" FOREIGN KEY ("examReminderCycleId") REFERENCES "ExamReminderCycle" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_TodoTask" ("createdAt", "doneAt", "doneByUserId", "dueDate", "id", "isDone", "patientId", "prescriptionId", "staffUserId", "taskType") SELECT "createdAt", "doneAt", "doneByUserId", "dueDate", "id", "isDone", "patientId", "prescriptionId", "staffUserId", "taskType" FROM "TodoTask";
DROP TABLE "TodoTask";
ALTER TABLE "new_TodoTask" RENAME TO "TodoTask";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "ExamReminderCycle_patientId_examType_key" ON "ExamReminderCycle"("patientId", "examType");
