-- CreateTable
CREATE TABLE "PatientNote" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "patientId" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "staffUserId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PatientNote_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PatientNote_staffUserId_fkey" FOREIGN KEY ("staffUserId") REFERENCES "StaffUser" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_MessageLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "patientId" INTEGER NOT NULL,
    "messageType" TEXT NOT NULL,
    "sentDate" DATETIME,
    "staffUserId" INTEGER,
    "skippedAt" DATETIME,
    "skippedByUserId" INTEGER,
    "aiDraftContent" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MessageLog_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "MessageLog_staffUserId_fkey" FOREIGN KEY ("staffUserId") REFERENCES "StaffUser" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "MessageLog_skippedByUserId_fkey" FOREIGN KEY ("skippedByUserId") REFERENCES "StaffUser" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_MessageLog" ("aiDraftContent", "createdAt", "id", "messageType", "patientId", "sentDate", "staffUserId") SELECT "aiDraftContent", "createdAt", "id", "messageType", "patientId", "sentDate", "staffUserId" FROM "MessageLog";
DROP TABLE "MessageLog";
ALTER TABLE "new_MessageLog" RENAME TO "MessageLog";
CREATE UNIQUE INDEX "MessageLog_patientId_messageType_key" ON "MessageLog"("patientId", "messageType");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
