-- AlterTable
ALTER TABLE "Patient" ADD COLUMN "kakaoChannelConnected" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Patient" ADD COLUMN "kakaoChannelConnectedByStaffId" INTEGER;
ALTER TABLE "Patient" ADD COLUMN "kakaoChannelConnectedAt" DATETIME;
