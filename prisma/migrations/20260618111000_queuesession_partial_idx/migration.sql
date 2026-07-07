-- CreateIndex
CREATE UNIQUE INDEX unique_active_staff_session ON "QueueSession" ("staffId") WHERE "isActive" = true;
