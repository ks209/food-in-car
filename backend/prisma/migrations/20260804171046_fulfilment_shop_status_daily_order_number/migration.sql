-- AlterEnum
ALTER TYPE "public"."OrderStatus" ADD VALUE 'NOT_FULFILLED';

-- AlterTable
ALTER TABLE "public"."Order" ADD COLUMN     "dailyOrderNumber" INTEGER;

-- AlterTable
ALTER TABLE "public"."Restaurant" ADD COLUMN     "deliveryEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "isOpen" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "public"."DailyCounter" (
    "id" SERIAL NOT NULL,
    "restaurantId" INTEGER NOT NULL,
    "date" TEXT NOT NULL,
    "lastNumber" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DailyCounter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DailyCounter_restaurantId_date_key" ON "public"."DailyCounter"("restaurantId", "date");

-- AddForeignKey
ALTER TABLE "public"."DailyCounter" ADD CONSTRAINT "DailyCounter_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "public"."Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
