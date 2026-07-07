-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_TodoTask" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "prescriptionId" INTEGER,
    "patientId" INTEGER,
    "taskType" TEXT NOT NULL,
    "dueDate" DATETIME NOT NULL,
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
INSERT INTO "new_TodoTask" ("createdAt", "doneAt", "doneByUserId", "dueDate", "id", "isDone", "prescriptionId", "staffUserId", "taskType") SELECT "createdAt", "doneAt", "doneByUserId", "dueDate", "id", "isDone", "prescriptionId", "staffUserId", "taskType" FROM "TodoTask";
DROP TABLE "TodoTask";
ALTER TABLE "new_TodoTask" RENAME TO "TodoTask";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
