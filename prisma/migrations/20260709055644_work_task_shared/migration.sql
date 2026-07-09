-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_WorkTask" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "todoTaskId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "creatorId" INTEGER NOT NULL,
    "assigneeId" INTEGER,
    "isSharedTask" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkTask_todoTaskId_fkey" FOREIGN KEY ("todoTaskId") REFERENCES "TodoTask" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "WorkTask_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "StaffUser" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "WorkTask_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "StaffUser" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_WorkTask" ("assigneeId", "createdAt", "creatorId", "description", "id", "title", "todoTaskId") SELECT "assigneeId", "createdAt", "creatorId", "description", "id", "title", "todoTaskId" FROM "WorkTask";
DROP TABLE "WorkTask";
ALTER TABLE "new_WorkTask" RENAME TO "WorkTask";
CREATE UNIQUE INDEX "WorkTask_todoTaskId_key" ON "WorkTask"("todoTaskId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
