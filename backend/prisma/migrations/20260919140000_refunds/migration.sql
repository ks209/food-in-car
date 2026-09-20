-- CreateTable
CREATE TABLE "public"."Refund" (
    "id" SERIAL NOT NULL,
    "orderId" INTEGER NOT NULL,
    "refundTxnId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Refund_refundTxnId_key" ON "public"."Refund"("refundTxnId");

-- CreateIndex
CREATE INDEX "Refund_orderId_idx" ON "public"."Refund"("orderId");

-- AddForeignKey
ALTER TABLE "public"."Refund" ADD CONSTRAINT "Refund_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "public"."Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

