BEGIN;

ALTER TABLE "public"."approval_steps"
DROP CONSTRAINT "approval_steps_workflow_id_fkey";

ALTER TABLE "public"."approval_steps"
ADD CONSTRAINT "approval_steps_workflow_id_fkey"
FOREIGN KEY ("workflow_id")
REFERENCES "public"."approval_workflows"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
