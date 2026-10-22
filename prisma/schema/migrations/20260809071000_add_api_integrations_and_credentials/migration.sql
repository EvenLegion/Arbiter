-- CreateEnum
CREATE TYPE "ApiIntegrationState" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateTable
CREATE TABLE "ApiIntegration" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "state" "ApiIntegrationState" NOT NULL DEFAULT 'ACTIVE',
    "createdByUserId" TEXT NOT NULL,
    "updatedByUserId" TEXT NOT NULL,
    "archivedByUserId" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApiIntegration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiCredential" (
    "id" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "verifier" TEXT NOT NULL,
    "scopes" TEXT[],
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "revokedByUserId" TEXT,
    "revokedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApiCredential_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ApiIntegration_nameKey_key" ON "ApiIntegration"("nameKey");
CREATE INDEX "ApiIntegration_state_createdAt_idx" ON "ApiIntegration"("state", "createdAt");
CREATE INDEX "ApiIntegration_createdByUserId_idx" ON "ApiIntegration"("createdByUserId");
CREATE INDEX "ApiIntegration_updatedByUserId_idx" ON "ApiIntegration"("updatedByUserId");
CREATE INDEX "ApiIntegration_archivedByUserId_idx" ON "ApiIntegration"("archivedByUserId");
CREATE UNIQUE INDEX "ApiCredential_prefix_key" ON "ApiCredential"("prefix");
CREATE INDEX "ApiCredential_integrationId_createdAt_idx" ON "ApiCredential"("integrationId", "createdAt");
CREATE INDEX "ApiCredential_createdByUserId_idx" ON "ApiCredential"("createdByUserId");
CREATE INDEX "ApiCredential_revokedByUserId_idx" ON "ApiCredential"("revokedByUserId");
CREATE INDEX "ApiCredential_expiresAt_idx" ON "ApiCredential"("expiresAt");

-- AddForeignKey
ALTER TABLE "ApiIntegration" ADD CONSTRAINT "ApiIntegration_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ApiIntegration" ADD CONSTRAINT "ApiIntegration_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ApiIntegration" ADD CONSTRAINT "ApiIntegration_archivedByUserId_fkey" FOREIGN KEY ("archivedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ApiCredential" ADD CONSTRAINT "ApiCredential_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "ApiIntegration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ApiCredential" ADD CONSTRAINT "ApiCredential_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ApiCredential" ADD CONSTRAINT "ApiCredential_revokedByUserId_fkey" FOREIGN KEY ("revokedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
