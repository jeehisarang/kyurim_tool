-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ActivityLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "actorType" TEXT NOT NULL,
    "actorId" INTEGER,
    "actionType" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isChecked" BOOLEAN NOT NULL DEFAULT false,
    "checkedByStaffId" INTEGER,
    "checkedAt" DATETIME,
    CONSTRAINT "ActivityLog_checkedByStaffId_fkey" FOREIGN KEY ("checkedByStaffId") REFERENCES "StaffUser" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ActivityLog" ("actionType", "actorId", "actorType", "createdAt", "id", "label") SELECT "actionType", "actorId", "actorType", "createdAt", "id", "label" FROM "ActivityLog";
DROP TABLE "ActivityLog";
ALTER TABLE "new_ActivityLog" RENAME TO "ActivityLog";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
