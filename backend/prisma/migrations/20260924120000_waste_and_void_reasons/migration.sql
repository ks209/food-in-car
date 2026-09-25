-- AlterTable
ALTER TABLE "public"."Order" ADD COLUMN     "cancelReason" TEXT,
ADD COLUMN     "cancelledBy" TEXT;

-- CreateTable
CREATE TABLE "public"."WasteLog" (
    "id" SERIAL NOT NULL,
    "restaurantId" INTEGER NOT NULL,
    "menuItemId" INTEGER,
    "name" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL,
    "estimatedCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "note" TEXT,
    "loggedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WasteLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WasteLog_restaurantId_createdAt_idx" ON "public"."WasteLog"("restaurantId", "createdAt");

-- AddForeignKey
ALTER TABLE "public"."WasteLog" ADD CONSTRAINT "WasteLog_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "public"."Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WasteLog" ADD CONSTRAINT "WasteLog_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "public"."MenuItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

