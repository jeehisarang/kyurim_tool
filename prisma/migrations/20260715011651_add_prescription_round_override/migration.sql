-- CreateTable
CREATE TABLE "PrescriptionRoundOverride" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "prescriptionId" INTEGER NOT NULL,
    "roundNumber" INTEGER NOT NULL,
    "overrideDate" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PrescriptionRoundOverride_prescriptionId_fkey" FOREIGN KEY ("prescriptionId") REFERENCES "Prescription" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "PrescriptionRoundOverride_prescriptionId_roundNumber_key" ON "PrescriptionRoundOverride"("prescriptionId", "roundNumber");
