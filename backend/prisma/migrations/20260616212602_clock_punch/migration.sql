-- DropForeignKey
ALTER TABLE "ClockInEvent" DROP CONSTRAINT "ClockInEvent_shiftId_fkey";

-- AlterTable
ALTER TABLE "ClockInEvent" ADD COLUMN     "facilityId" TEXT,
ALTER COLUMN "shiftId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "ClockInEvent_facilityId_timestamp_idx" ON "ClockInEvent"("facilityId", "timestamp");

-- AddForeignKey
ALTER TABLE "ClockInEvent" ADD CONSTRAINT "ClockInEvent_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE SET NULL ON UPDATE CASCADE;
