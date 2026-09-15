-- AlterTable
ALTER TABLE "public"."Order" ADD COLUMN     "claimedAt" TIMESTAMP(3),
ADD COLUMN     "claimedByWaiterId" INTEGER;

-- AddForeignKey
ALTER TABLE "public"."Order" ADD CONSTRAINT "Order_claimedByWaiterId_fkey" FOREIGN KEY ("claimedByWaiterId") REFERENCES "public"."Waiter"("id") ON DELETE SET NULL ON UPDATE CASCADE;
