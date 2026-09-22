-- Preserve the existing approval-required policy for every existing branch.
ALTER TABLE "property_operational_configs"
ADD COLUMN "require_approval" BOOLEAN NOT NULL DEFAULT true;
