-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Visit" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "patientId" INTEGER NOT NULL,
    "visitDate" DATETIME NOT NULL,
    "treatmentCategoryId" INTEGER NOT NULL,
    "visitTypeId" INTEGER NOT NULL,
    "isReserved" BOOLEAN NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checkedByUserId" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "Visit_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Visit_treatmentCategoryId_fkey" FOREIGN KEY ("treatmentCategoryId") REFERENCES "TreatmentCategory" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Visit_visitTypeId_fkey" FOREIGN KEY ("visitTypeId") REFERENCES "VisitType" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Visit_checkedByUserId_fkey" FOREIGN KEY ("checkedByUserId") REFERENCES "StaffUser" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Visit" ("checkedByUserId", "createdAt", "id", "isReserved", "patientId", "treatmentCategoryId", "visitDate", "visitTypeId") SELECT "checkedByUserId", "createdAt", "id", "isReserved", "patientId", "treatmentCategoryId", "visitDate", "visitTypeId" FROM "Visit";
DROP TABLE "Visit";
ALTER TABLE "new_Visit" RENAME TO "Visit";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
