-- CreateEnum
CREATE TYPE "DivisionKind" AS ENUM ('STAFF', 'SPECIAL', 'LANCEARIUS', 'NAVY', 'MARINES', 'SUPPORT', 'RESERVE', 'LEGIONNAIRE', 'INITIATE');

-- CreateEnum
CREATE TYPE "NameChangeRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'DENIED');

-- CreateEnum
CREATE TYPE "MeritTypeCode" AS ENUM ('TIER_0', 'TIER_1', 'TIER_2', 'TIER_3', 'TRAINING', 'COMMANDER_MERIT', 'CENTURION_HOST_MERIT', 'TESSERARIUS_MERIT', 'DEMERIT');

-- CreateEnum
CREATE TYPE "EventSessionState" AS ENUM ('DRAFT', 'CANCELLED', 'ACTIVE', 'ENDED_PENDING_REVIEW', 'FINALIZED_WITH_MERITS', 'FINALIZED_NO_MERITS');

-- CreateEnum
CREATE TYPE "EventReviewDecisionKind" AS ENUM ('MERIT', 'NO_MERIT');

-- CreateEnum
CREATE TYPE "EventSessionChannelKind" AS ENUM ('EVENT_THREAD', 'PARENT_VC', 'CHILD_VC');

-- CreateEnum
CREATE TYPE "EventSessionMessageKind" AS ENUM ('ACTIVE', 'TRACKING_SUMMARY', 'TRACKING_SUMMARY_PARENT_VC', 'REVIEW');

-- CreateTable
CREATE TABLE "Healthcheck" (
    "id" SERIAL NOT NULL,
    "randomNumber" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Healthcheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "discordUserId" TEXT NOT NULL,
    "discordUsername" TEXT NOT NULL,
    "discordNickname" TEXT NOT NULL,
    "discordAvatarUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Division" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "DivisionKind" NOT NULL,
    "displayNamePrefix" TEXT,
    "showRank" BOOLEAN NOT NULL DEFAULT false,
    "emojiName" TEXT,
    "emojiId" TEXT,
    "discordRoleId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Division_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DivisionMembership" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "divisionId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DivisionMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NameChangeRequest" (
    "id" SERIAL NOT NULL,
    "requesterUserId" TEXT NOT NULL,
    "currentName" TEXT NOT NULL,
    "requestedName" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "NameChangeRequestStatus" NOT NULL DEFAULT 'PENDING',
    "reviewerUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewThreadId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NameChangeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeritType" (
    "id" SERIAL NOT NULL,
    "code" "MeritTypeCode" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "meritAmount" INTEGER NOT NULL,
    "isManualAwardable" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "MeritType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Merit" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "awardedByUserId" TEXT NOT NULL,
    "meritTypeId" INTEGER NOT NULL,
    "reason" TEXT,
    "eventSessionId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Merit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventTier" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "meritTypeId" INTEGER NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventTier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" SERIAL NOT NULL,
    "hostUserId" TEXT NOT NULL,
    "eventTierId" INTEGER NOT NULL,
    "threadId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "state" "EventSessionState" NOT NULL DEFAULT 'DRAFT',
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "reviewFinalizedAt" TIMESTAMP(3),
    "reviewFinalizedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventChannel" (
    "id" SERIAL NOT NULL,
    "eventSessionId" INTEGER NOT NULL,
    "channelId" TEXT NOT NULL,
    "kind" "EventSessionChannelKind" NOT NULL,
    "addedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventChannel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventParticipantStat" (
    "id" SERIAL NOT NULL,
    "eventSessionId" INTEGER NOT NULL,
    "userId" TEXT NOT NULL,
    "attendedSeconds" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventParticipantStat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventReviewDecision" (
    "id" SERIAL NOT NULL,
    "eventSessionId" INTEGER NOT NULL,
    "targetUserId" TEXT NOT NULL,
    "decision" "EventReviewDecisionKind" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventReviewDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventMessage" (
    "id" SERIAL NOT NULL,
    "eventSessionId" INTEGER NOT NULL,
    "kind" "EventSessionMessageKind" NOT NULL,
    "channelId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Healthcheck_randomNumber_key" ON "Healthcheck"("randomNumber");

-- CreateIndex
CREATE UNIQUE INDEX "User_discordUserId_key" ON "User"("discordUserId");

-- CreateIndex
CREATE UNIQUE INDEX "Division_code_key" ON "Division"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Division_name_key" ON "Division"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Division_discordRoleId_key" ON "Division"("discordRoleId");

-- CreateIndex
CREATE INDEX "Division_kind_idx" ON "Division"("kind");

-- CreateIndex
CREATE INDEX "DivisionMembership_userId_idx" ON "DivisionMembership"("userId");

-- CreateIndex
CREATE INDEX "DivisionMembership_divisionId_idx" ON "DivisionMembership"("divisionId");

-- CreateIndex
CREATE UNIQUE INDEX "DivisionMembership_userId_divisionId_key" ON "DivisionMembership"("userId", "divisionId");

-- CreateIndex
CREATE INDEX "NameChangeRequest_requesterUserId_idx" ON "NameChangeRequest"("requesterUserId");

-- CreateIndex
CREATE INDEX "NameChangeRequest_reviewerUserId_idx" ON "NameChangeRequest"("reviewerUserId");

-- CreateIndex
CREATE INDEX "NameChangeRequest_status_idx" ON "NameChangeRequest"("status");

-- CreateIndex
CREATE INDEX "NameChangeRequest_reviewThreadId_idx" ON "NameChangeRequest"("reviewThreadId");

-- CreateIndex
CREATE UNIQUE INDEX "MeritType_code_key" ON "MeritType"("code");

-- CreateIndex
CREATE UNIQUE INDEX "MeritType_name_key" ON "MeritType"("name");

-- CreateIndex
CREATE INDEX "Merit_userId_createdAt_idx" ON "Merit"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Merit_userId_meritTypeId_createdAt_idx" ON "Merit"("userId", "meritTypeId", "createdAt");

-- CreateIndex
CREATE INDEX "Merit_meritTypeId_eventSessionId_userId_idx" ON "Merit"("meritTypeId", "eventSessionId", "userId");

-- CreateIndex
CREATE INDEX "Merit_eventSessionId_idx" ON "Merit"("eventSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "EventTier_code_key" ON "EventTier"("code");

-- CreateIndex
CREATE UNIQUE INDEX "EventTier_name_key" ON "EventTier"("name");

-- CreateIndex
CREATE INDEX "EventTier_displayOrder_idx" ON "EventTier"("displayOrder");

-- CreateIndex
CREATE INDEX "EventTier_meritTypeId_idx" ON "EventTier"("meritTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "Event_threadId_key" ON "Event"("threadId");

-- CreateIndex
CREATE INDEX "Event_state_idx" ON "Event"("state");

-- CreateIndex
CREATE INDEX "Event_state_createdAt_idx" ON "Event"("state", "createdAt");

-- CreateIndex
CREATE INDEX "Event_state_startedAt_idx" ON "Event"("state", "startedAt");

-- CreateIndex
CREATE INDEX "Event_hostUserId_idx" ON "Event"("hostUserId");

-- CreateIndex
CREATE INDEX "Event_reviewFinalizedByUserId_idx" ON "Event"("reviewFinalizedByUserId");

-- CreateIndex
CREATE INDEX "EventChannel_eventSessionId_idx" ON "EventChannel"("eventSessionId");

-- CreateIndex
CREATE INDEX "EventChannel_eventSessionId_kind_idx" ON "EventChannel"("eventSessionId", "kind");

-- CreateIndex
CREATE INDEX "EventChannel_channelId_idx" ON "EventChannel"("channelId");

-- CreateIndex
CREATE UNIQUE INDEX "EventChannel_eventSessionId_channelId_key" ON "EventChannel"("eventSessionId", "channelId");

-- CreateIndex
CREATE INDEX "EventParticipantStat_eventSessionId_attendedSeconds_idx" ON "EventParticipantStat"("eventSessionId", "attendedSeconds");

-- CreateIndex
CREATE INDEX "EventParticipantStat_userId_idx" ON "EventParticipantStat"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "EventParticipantStat_eventSessionId_userId_key" ON "EventParticipantStat"("eventSessionId", "userId");

-- CreateIndex
CREATE INDEX "EventReviewDecision_eventSessionId_idx" ON "EventReviewDecision"("eventSessionId");

-- CreateIndex
CREATE INDEX "EventReviewDecision_eventSessionId_decision_idx" ON "EventReviewDecision"("eventSessionId", "decision");

-- CreateIndex
CREATE UNIQUE INDEX "EventReviewDecision_eventSessionId_targetUserId_key" ON "EventReviewDecision"("eventSessionId", "targetUserId");

-- CreateIndex
CREATE UNIQUE INDEX "EventMessage_eventSessionId_kind_key" ON "EventMessage"("eventSessionId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "EventMessage_channelId_messageId_key" ON "EventMessage"("channelId", "messageId");

-- AddForeignKey
ALTER TABLE "DivisionMembership" ADD CONSTRAINT "DivisionMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DivisionMembership" ADD CONSTRAINT "DivisionMembership_divisionId_fkey" FOREIGN KEY ("divisionId") REFERENCES "Division"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NameChangeRequest" ADD CONSTRAINT "NameChangeRequest_requesterUserId_fkey" FOREIGN KEY ("requesterUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NameChangeRequest" ADD CONSTRAINT "NameChangeRequest_reviewerUserId_fkey" FOREIGN KEY ("reviewerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Merit" ADD CONSTRAINT "Merit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Merit" ADD CONSTRAINT "Merit_awardedByUserId_fkey" FOREIGN KEY ("awardedByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Merit" ADD CONSTRAINT "Merit_meritTypeId_fkey" FOREIGN KEY ("meritTypeId") REFERENCES "MeritType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Merit" ADD CONSTRAINT "Merit_eventSessionId_fkey" FOREIGN KEY ("eventSessionId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventTier" ADD CONSTRAINT "EventTier_meritTypeId_fkey" FOREIGN KEY ("meritTypeId") REFERENCES "MeritType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_hostUserId_fkey" FOREIGN KEY ("hostUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_reviewFinalizedByUserId_fkey" FOREIGN KEY ("reviewFinalizedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_eventTierId_fkey" FOREIGN KEY ("eventTierId") REFERENCES "EventTier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventChannel" ADD CONSTRAINT "EventChannel_eventSessionId_fkey" FOREIGN KEY ("eventSessionId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventChannel" ADD CONSTRAINT "EventChannel_addedByUserId_fkey" FOREIGN KEY ("addedByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventParticipantStat" ADD CONSTRAINT "EventParticipantStat_eventSessionId_fkey" FOREIGN KEY ("eventSessionId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventParticipantStat" ADD CONSTRAINT "EventParticipantStat_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventReviewDecision" ADD CONSTRAINT "EventReviewDecision_eventSessionId_fkey" FOREIGN KEY ("eventSessionId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventReviewDecision" ADD CONSTRAINT "EventReviewDecision_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventMessage" ADD CONSTRAINT "EventMessage_eventSessionId_fkey" FOREIGN KEY ("eventSessionId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
