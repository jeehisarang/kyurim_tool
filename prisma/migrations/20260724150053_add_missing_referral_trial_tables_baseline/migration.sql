-- 소급 보정 마이그레이션(task.md — shadow-DB 재생 이슈 근본 원인 수정).
--
-- ReferralLink/TrialApplication/ExitSurveyResponse/ReferralCreditEntry/TrialCampaignSettings
-- 5개 테이블이 과거 `prisma db push`로만 추가되고 정식 마이그레이션으로 한 번도 캡처된 적이
-- 없었다. 그 결과 이후 이 테이블들을 ALTER하는 마이그레이션들(20260724150054_add_referral_
-- credit_status 등)이 "빈 데이터베이스" 기준으로 재생(shadow DB, 또는 새 PC의 최초
-- `migrate deploy`)될 때 "no such table" 에러로 실패했다 — `migrate dev`가 매번 막히던
-- 근본 원인.
--
-- 이 마이그레이션은 그 5개 테이블을 "당시(2026-07-24 이전) 실제 있던 모습" 그대로 여기서
-- 정식으로 생성한다(뒤이은 ALTER 마이그레이션들이 기대하는, 아직 새 컬럼이 추가되기 전
-- 상태) — 그래야 이후 마이그레이션들이 재생 시 정확히 같은 순서로 컬럼을 추가하며 최종
-- 스키마가 100% 일치한다. IF NOT EXISTS를 써서 이미 db push로 테이블이 존재하는 이
-- 개발 PC에서는 아무 것도 바꾸지 않고(no-op) 그냥 "적용됨"으로만 기록되고, 새로 pull받는
-- PC(빈 dev.db)에서는 실제로 테이블을 생성해 이후 마이그레이션이 정상적으로 이어진다.

-- CreateTable
CREATE TABLE IF NOT EXISTS "TrialApplication" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "heightWeight" TEXT,
    "weightGoalKg" TEXT,
    "weightChange6mo" TEXT,
    "currentMeds" TEXT,
    "pastHistory" TEXT,
    "familyHistory" TEXT,
    "dietExperience" TEXT,
    "bodyType1" TEXT NOT NULL,
    "bodyType1Other" TEXT,
    "bodyType2" TEXT NOT NULL,
    "bodyType2Other" TEXT,
    "bodyType3" TEXT NOT NULL,
    "bodyType3Other" TEXT,
    "bodyType4" TEXT NOT NULL,
    "bodyType4Other" TEXT,
    "bodyType5" TEXT NOT NULL,
    "bodyType5Other" TEXT,
    "bodyType6" TEXT NOT NULL,
    "bodyType6Other" TEXT,
    "referralToken" TEXT,
    "submittedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "convertedPrescriptionId" INTEGER,
    CONSTRAINT "TrialApplication_convertedPrescriptionId_fkey" FOREIGN KEY ("convertedPrescriptionId") REFERENCES "Prescription" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "TrialApplication_convertedPrescriptionId_key" ON "TrialApplication"("convertedPrescriptionId");

-- CreateTable
CREATE TABLE IF NOT EXISTS "ReferralLink" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "token" TEXT NOT NULL,
    "patientId" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "sourcePrescriptionId" INTEGER NOT NULL,
    "issuedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "ReferralLink_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ReferralLink_sourcePrescriptionId_fkey" FOREIGN KEY ("sourcePrescriptionId") REFERENCES "Prescription" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ReferralLink_token_key" ON "ReferralLink"("token");

-- CreateTable
CREATE TABLE IF NOT EXISTS "ExitSurveyResponse" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "prescriptionId" INTEGER NOT NULL,
    "compliance" TEXT NOT NULL,
    "changes" TEXT NOT NULL,
    "consultInterest" TEXT NOT NULL,
    "comment" TEXT,
    "submittedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ExitSurveyResponse_prescriptionId_fkey" FOREIGN KEY ("prescriptionId") REFERENCES "Prescription" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ExitSurveyResponse_prescriptionId_key" ON "ExitSurveyResponse"("prescriptionId");

-- CreateTable
CREATE TABLE IF NOT EXISTS "ReferralCreditEntry" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "patientId" INTEGER NOT NULL,
    "linkToken" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "referredName" TEXT NOT NULL,
    "referredTrialApplicationId" INTEGER,
    "referredPrescriptionId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedByStaffId" INTEGER,
    CONSTRAINT "ReferralCreditEntry_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ReferralCreditEntry_referredTrialApplicationId_fkey" FOREIGN KEY ("referredTrialApplicationId") REFERENCES "TrialApplication" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ReferralCreditEntry_referredPrescriptionId_fkey" FOREIGN KEY ("referredPrescriptionId") REFERENCES "Prescription" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ReferralCreditEntry_confirmedByStaffId_fkey" FOREIGN KEY ("confirmedByStaffId") REFERENCES "StaffUser" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "TrialCampaignSettings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "heroImagePath" TEXT,
    "headline" TEXT,
    "description" TEXT,
    "updatedAt" DATETIME NOT NULL
);
