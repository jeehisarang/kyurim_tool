-- CreateTable
CREATE TABLE "WorkTask" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "todoTaskId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "creatorId" INTEGER NOT NULL,
    "assigneeId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkTask_todoTaskId_fkey" FOREIGN KEY ("todoTaskId") REFERENCES "TodoTask" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "WorkTask_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "StaffUser" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "WorkTask_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "StaffUser" ("id") ON DELETE SET NULL ON UPDATE CASCADE
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
    CONSTRAINT "TodoTask_prescriptionId_fkey" FOREIGN KEY ("prescriptionId") REFERENCES "Prescription" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TodoTask_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TodoTask_staffUserId_fkey" FOREIGN KEY ("staffUserId") REFERENCES "StaffUser" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TodoTask_doneByUserId_fkey" FOREIGN KEY ("doneByUserId") REFERENCES "StaffUser" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_TodoTask" ("createdAt", "doneAt", "doneByUserId", "dueDate", "id", "isDone", "patientId", "prescriptionId", "staffUserId", "taskType") SELECT "createdAt", "doneAt", "doneByUserId", "dueDate", "id", "isDone", "patientId", "prescriptionId", "staffUserId", "taskType" FROM "TodoTask";
DROP TABLE "TodoTask";
ALTER TABLE "new_TodoTask" RENAME TO "TodoTask";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "WorkTask_todoTaskId_key" ON "WorkTask"("todoTaskId");
