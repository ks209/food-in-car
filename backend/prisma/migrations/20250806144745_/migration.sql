/*
  Warnings:

  - A unique constraint covering the columns `[username]` on the table `Restaurant` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "Restaurant_username_key" ON "public"."Restaurant"("username");
