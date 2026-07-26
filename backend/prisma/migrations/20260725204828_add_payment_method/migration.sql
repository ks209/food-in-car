-- CreateEnum
CREATE TYPE "public"."PaymentMethod" AS ENUM ('COD', 'PHONEPE');

-- AlterTable
ALTER TABLE "public"."Order" ADD COLUMN     "paymentMethod" "public"."PaymentMethod" NOT NULL DEFAULT 'COD';
