-- AlterTable
ALTER TABLE "time_correction_requests" ADD COLUMN "work_shift_id" TEXT;

-- AddForeignKey
ALTER TABLE "time_correction_requests" ADD CONSTRAINT "time_correction_requests_work_shift_id_fkey" FOREIGN KEY ("work_shift_id") REFERENCES "work_shifts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
