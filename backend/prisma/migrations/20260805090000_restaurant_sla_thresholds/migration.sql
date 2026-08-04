-- AlterTable
ALTER TABLE "public"."Restaurant" ADD COLUMN     "slaWarnMinutes" INTEGER NOT NULL DEFAULT 8,
ADD COLUMN     "slaCritMinutes" INTEGER NOT NULL DEFAULT 15;
