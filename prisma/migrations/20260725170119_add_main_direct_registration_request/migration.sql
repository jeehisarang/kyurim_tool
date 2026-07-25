-- CreateTable
CREATE TABLE "MainDirectRegistrationRequest" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "referrerPatientId" INTEGER NOT NULL,
    "submittedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "workTaskId" INTEGER,
    CONSTRAINT "MainDirectRegistrationRequest_referrerPatientId_fkey" FOREIGN KEY ("referrerPatientId") REFERENCES "Patient" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "MainDirectRegistrationRequest_workTaskId_fkey" FOREIGN KEY ("workTaskId") REFERENCES "WorkTask" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "MainDirectRegistrationRequest_workTaskId_key" ON "MainDirectRegistrationRequest"("workTaskId");
