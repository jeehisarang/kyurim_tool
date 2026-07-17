-- AlterTable
ALTER TABLE "HrvTestRecord" ADD COLUMN "aiCheckedSymptomsJson" TEXT;
ALTER TABLE "HrvTestRecord" ADD COLUMN "aiProgressionCard" TEXT;
ALTER TABLE "HrvTestRecord" ADD COLUMN "aiRedFlagNotice" TEXT;

-- AlterTable
ALTER TABLE "TcmCategory" ADD COLUMN "redFlagNotice" TEXT;
