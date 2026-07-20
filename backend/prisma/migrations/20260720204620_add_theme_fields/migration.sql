-- AlterTable
ALTER TABLE "public"."Restaurant" ADD COLUMN     "accentColor" TEXT NOT NULL DEFAULT '#f59e0b',
ADD COLUMN     "cardStyle" TEXT NOT NULL DEFAULT 'rounded',
ADD COLUMN     "fontFamily" TEXT NOT NULL DEFAULT 'manrope',
ADD COLUMN     "secondaryColor" TEXT NOT NULL DEFAULT '#7c3aed';
