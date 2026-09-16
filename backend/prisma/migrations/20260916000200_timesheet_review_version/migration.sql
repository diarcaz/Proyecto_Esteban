-- Existing approval models gain immutable review evidence and optimistic concurrency.
ALTER TABLE "timesheets" ADD COLUMN "review_snapshot" JSONB, ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;
