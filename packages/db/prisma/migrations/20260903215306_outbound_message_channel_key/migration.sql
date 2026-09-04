/*
  Warnings:

  - A unique constraint covering the columns `[clientId,template,channel]` on the table `OutboundMessage` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "OutboundMessage_clientId_template_key";

-- CreateIndex
CREATE UNIQUE INDEX "OutboundMessage_clientId_template_channel_key" ON "OutboundMessage"("clientId", "template", "channel");
