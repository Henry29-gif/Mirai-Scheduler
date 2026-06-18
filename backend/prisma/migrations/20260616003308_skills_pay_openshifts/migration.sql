-- CreateEnum
CREATE TYPE "Certification" AS ENUM ('RN', 'LPN', 'CCA');

-- AlterEnum
ALTER TYPE "ShiftStatus" ADD VALUE 'OPEN';

-- DropForeignKey
ALTER TABLE "Shift" DROP CONSTRAINT "Shift_staffId_fkey";

-- AlterTable
ALTER TABLE "Shift" ADD COLUMN     "requiredCertification" "Certification",
ALTER COLUMN "staffId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "certification" "Certification",
ADD COLUMN     "hourlyRate" DOUBLE PRECISION;

-- AddForeignKey
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
