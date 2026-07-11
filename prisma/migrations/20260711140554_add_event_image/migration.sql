-- CreateTable
CREATE TABLE "EventImage" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "rawIdea" TEXT NOT NULL,
    "finalTitle" TEXT NOT NULL,
    "finalCopy" TEXT NOT NULL,
    "backgroundImagePath" TEXT NOT NULL,
    "compositeImagePath" TEXT NOT NULL,
    "createdByStaffId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "EventImage_createdByStaffId_fkey" FOREIGN KEY ("createdByStaffId") REFERENCES "StaffUser" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
