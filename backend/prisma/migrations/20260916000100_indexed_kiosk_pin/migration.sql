-- Additive only. Existing PIN hashes remain canonical. No PIN is reset.
ALTER TABLE "users" ADD COLUMN "pin_lookup_digest" VARCHAR(64);
CREATE INDEX "users_company_id_pin_lookup_digest_idx" ON "users"("company_id", "pin_lookup_digest");
CREATE INDEX "employee_assignments_kiosk_eligibility_idx" ON "employee_assignments"("user_id", "property_id", "active", "effective_from");
CREATE TABLE "pin_lookup_config" ("id" INTEGER NOT NULL PRIMARY KEY CHECK ("id" = 1), "key_fingerprint" VARCHAR(64) NOT NULL);
