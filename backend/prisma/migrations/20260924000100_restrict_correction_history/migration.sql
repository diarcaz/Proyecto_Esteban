-- Preserve correction history when a referenced Staff, Branch or requester is deleted.
BEGIN;
-- DropForeignKey
ALTER TABLE "time_correction_requests" DROP CONSTRAINT "time_correction_requests_user_id_fkey";

-- DropForeignKey
ALTER TABLE "time_correction_requests" DROP CONSTRAINT "time_correction_requests_property_id_fkey";

-- DropForeignKey
ALTER TABLE "time_correction_requests" DROP CONSTRAINT "time_correction_requests_requested_by_id_fkey";

-- AddForeignKey
ALTER TABLE "time_correction_requests" ADD CONSTRAINT "time_correction_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_correction_requests" ADD CONSTRAINT "time_correction_requests_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_correction_requests" ADD CONSTRAINT "time_correction_requests_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


COMMIT;
