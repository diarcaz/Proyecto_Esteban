-- AlterTable
ALTER TABLE "work_shifts" ADD COLUMN "markup_type_applied" "MarkupType",
ADD COLUMN "markup_value_applied" DECIMAL(10,2),
ADD COLUMN "minimum_shift_mins_applied" INTEGER;

-- Create partial unique index for concurrent OPEN work shift protection
CREATE UNIQUE INDEX "idx_unique_open_work_shift_per_user" ON "work_shifts" ("user_id") WHERE status = 'OPEN';
