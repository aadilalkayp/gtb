/*
  Warnings:

  - A unique constraint covering the columns `[unsubscribeToken]` on the table `Client` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "MessageChannel" AS ENUM ('email', 'whatsapp');

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('sent', 'failed', 'skipped');

-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "marketingOptOut" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "unsubscribeToken" TEXT;

-- CreateTable
CREATE TABLE "OutboundMessage" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "channel" "MessageChannel" NOT NULL,
    "template" TEXT NOT NULL,
    "status" "MessageStatus" NOT NULL,
    "providerId" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutboundMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OutboundMessage_clientId_createdAt_idx" ON "OutboundMessage"("clientId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "OutboundMessage_clientId_template_key" ON "OutboundMessage"("clientId", "template");

-- CreateIndex
CREATE UNIQUE INDEX "Client_unsubscribeToken_key" ON "Client"("unsubscribeToken");

-- AddForeignKey
ALTER TABLE "OutboundMessage" ADD CONSTRAINT "OutboundMessage_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
