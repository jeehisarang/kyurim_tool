-- AlterTable
ALTER TABLE "Patient" ADD COLUMN "memo" TEXT;

-- CreateTable
CREATE TABLE "MessageLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "patientId" INTEGER NOT NULL,
    "messageType" TEXT NOT NULL,
    "sentDate" DATETIME,
    "staffUserId" INTEGER,
    "aiDraftContent" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MessageLog_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "MessageLog_staffUserId_fkey" FOREIGN KEY ("staffUserId") REFERENCES "StaffUser" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "MessageLog_patientId_messageType_key" ON "MessageLog"("patientId", "messageType");
