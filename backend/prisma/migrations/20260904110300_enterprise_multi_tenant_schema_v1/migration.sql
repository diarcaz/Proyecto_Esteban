-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'OWNER';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'ADMIN';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'MANAGER';

-- CreateEnum
CREATE TYPE "MarkupType" AS ENUM ('FLAT_AMOUNT', 'PERCENTAGE', 'FIXED_BILL_RATE');
CREATE TYPE "TimeCorrectionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
CREATE TYPE "TimesheetStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'CORRECTION_REQUIRED');
CREATE TYPE "PeriodStatus" AS ENUM ('OPEN', 'PROCESSING', 'CLOSED');

-- AlterTable Users
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "company_id" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable PropertyOperationalConfig
CREATE TABLE IF NOT EXISTS "property_operational_configs" (
    "id" TEXT NOT NULL,
    "location_id" TEXT NOT NULL,
    "week_start_day" TEXT NOT NULL DEFAULT 'MONDAY',
    "payroll_frequency" TEXT NOT NULL DEFAULT 'WEEKLY',
    "payroll_period" TEXT NOT NULL DEFAULT 'CURRENT_WEEK',
    "payroll_cutoff" TEXT NOT NULL DEFAULT 'SUNDAY_2359',
    "payday" TEXT NOT NULL DEFAULT 'FRIDAY',
    "invoice_frequency" TEXT NOT NULL DEFAULT 'WEEKLY',
    "invoice_cutoff" TEXT NOT NULL DEFAULT 'SUNDAY_2359',
    "rounding_rules" JSONB,
    "max_shift_duration_minutes" INTEGER NOT NULL DEFAULT 960,
    "geofence_latitude" DOUBLE PRECISION,
    "geofence_longitude" DOUBLE PRECISION,
    "geofence_radius_meters" INTEGER DEFAULT 100,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "property_operational_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable PropertyBillingInfo
CREATE TABLE IF NOT EXISTS "property_billing_infos" (
    "id" TEXT NOT NULL,
    "location_id" TEXT NOT NULL,
    "legal_billing_entity" TEXT,
    "billing_address" TEXT,
    "payment_terms" TEXT DEFAULT 'NET_30',
    "po_required" BOOLEAN NOT NULL DEFAULT false,
    "tax_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "property_billing_infos_pkey" PRIMARY KEY ("id")
);

-- CreateTable PropertyContact
CREATE TABLE IF NOT EXISTS "property_contacts" (
    "id" TEXT NOT NULL,
    "location_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role_title" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "contact_type" TEXT NOT NULL DEFAULT 'SUPERVISOR',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "property_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable Positions
CREATE TABLE IF NOT EXISTS "positions" (
    "id" TEXT NOT NULL,
    "location_id" TEXT NOT NULL,
    "department_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "positions_pkey" PRIMARY KEY ("id")
);

-- CreateTable RateConfiguration
CREATE TABLE IF NOT EXISTS "rate_configurations" (
    "id" TEXT NOT NULL,
    "position_id" TEXT NOT NULL,
    "pay_rate" DECIMAL(10,2) NOT NULL,
    "bill_rate" DECIMAL(10,2) NOT NULL,
    "ot_pay_rate" DECIMAL(10,2),
    "ot_bill_rate" DECIMAL(10,2),
    "markup_type" "MarkupType" NOT NULL DEFAULT 'PERCENTAGE',
    "markup_value" DECIMAL(10,2),
    "minimum_shift_mins" INTEGER DEFAULT 240,
    "effective_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effective_until" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rate_configurations_pkey" PRIMARY KEY ("id")
);

-- CreateTable EmployeeAssignments
CREATE TABLE IF NOT EXISTS "employee_assignments" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "department_id" TEXT NOT NULL,
    "position_id" TEXT NOT NULL,
    "rate_configuration_id" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "effective_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effective_until" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable UserPropertyAccess
CREATE TABLE IF NOT EXISTS "user_property_accesses" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "role_override" "UserRole",
    "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_property_accesses_pkey" PRIMARY KEY ("id")
);

-- CreateTable WorkShift
CREATE TABLE IF NOT EXISTS "work_shifts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "location_id" TEXT NOT NULL,
    "department_id" TEXT,
    "position_id" TEXT,
    "employee_assignment_id" TEXT,
    "rate_configuration_id" TEXT,
    "clock_in_timestamp" TIMESTAMP(3) NOT NULL,
    "clock_out_timestamp" TIMESTAMP(3),
    "effective_clock_in" TIMESTAMP(3),
    "effective_clock_out" TIMESTAMP(3),
    "pay_rate_applied" DECIMAL(10,2),
    "bill_rate_applied" DECIMAL(10,2),
    "ot_pay_rate_applied" DECIMAL(10,2),
    "ot_bill_rate_applied" DECIMAL(10,2),
    "regular_minutes" INTEGER DEFAULT 0,
    "overtime_minutes" INTEGER DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "work_shifts_pkey" PRIMARY KEY ("id")
);

-- AlterTable AttendanceLog
ALTER TABLE "attendance_logs" ADD COLUMN IF NOT EXISTS "work_shift_id" TEXT;
ALTER TABLE "attendance_logs" ADD COLUMN IF NOT EXISTS "effective_timestamp" TIMESTAMP(3);

-- CreateTable TimeCorrectionRequest
CREATE TABLE IF NOT EXISTS "time_correction_requests" (
    "id" TEXT NOT NULL,
    "attendance_log_id" TEXT,
    "user_id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "original_timestamp" TIMESTAMP(3),
    "requested_timestamp" TIMESTAMP(3) NOT NULL,
    "effective_timestamp" TIMESTAMP(3),
    "correction_type" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "requested_by_id" TEXT NOT NULL,
    "reviewed_by_id" TEXT,
    "status" "TimeCorrectionStatus" NOT NULL DEFAULT 'PENDING',
    "reviewed_at" TIMESTAMP(3),
    "comments" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "time_correction_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable ApprovalWorkflow
CREATE TABLE IF NOT EXISTS "approval_workflows" (
    "id" TEXT NOT NULL,
    "location_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "approval_workflows_pkey" PRIMARY KEY ("id")
);

-- CreateTable ApprovalStep
CREATE TABLE IF NOT EXISTS "approval_steps" (
    "id" TEXT NOT NULL,
    "workflow_id" TEXT NOT NULL,
    "step_order" INTEGER NOT NULL,
    "step_name" TEXT NOT NULL,
    "approver_role" "UserRole",
    "approver_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "approval_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable TimesheetPeriod
CREATE TABLE IF NOT EXISTS "timesheet_periods" (
    "id" TEXT NOT NULL,
    "location_id" TEXT NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "period_type" TEXT NOT NULL DEFAULT 'WEEKLY',
    "status" "PeriodStatus" NOT NULL DEFAULT 'OPEN',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "timesheet_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable Timesheet
CREATE TABLE IF NOT EXISTS "timesheets" (
    "id" TEXT NOT NULL,
    "timesheet_period_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "location_id" TEXT NOT NULL,
    "regular_hours" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "overtime_hours" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "total_hours" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "current_step_order" INTEGER NOT NULL DEFAULT 1,
    "status" "TimesheetStatus" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "timesheets_pkey" PRIMARY KEY ("id")
);

-- CreateTable TimesheetApprovalHistory
CREATE TABLE IF NOT EXISTS "timesheet_approval_histories" (
    "id" TEXT NOT NULL,
    "timesheet_id" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "previous_status" "TimesheetStatus",
    "new_status" "TimesheetStatus" NOT NULL,
    "notes" TEXT,
    "step_order" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "timesheet_approval_histories_pkey" PRIMARY KEY ("id")
);

-- CreateIndexes
CREATE UNIQUE INDEX IF NOT EXISTS "property_operational_configs_location_id_key" ON "property_operational_configs"("location_id");
CREATE UNIQUE INDEX IF NOT EXISTS "property_billing_infos_location_id_key" ON "property_billing_infos"("location_id");
CREATE UNIQUE INDEX IF NOT EXISTS "user_property_accesses_user_id_property_id_key" ON "user_property_accesses"("user_id", "property_id");
CREATE UNIQUE INDEX IF NOT EXISTS "approval_steps_workflow_id_step_order_key" ON "approval_steps"("workflow_id", "step_order");
CREATE UNIQUE INDEX IF NOT EXISTS "timesheets_timesheet_period_id_user_id_key" ON "timesheets"("timesheet_period_id", "user_id");
CREATE INDEX IF NOT EXISTS "work_shifts_user_id_clock_in_timestamp_idx" ON "work_shifts"("user_id", "clock_in_timestamp");
CREATE INDEX IF NOT EXISTS "work_shifts_location_id_clock_in_timestamp_idx" ON "work_shifts"("location_id", "clock_in_timestamp");

-- AddForeignKeys
ALTER TABLE "users" ADD CONSTRAINT "users_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "property_operational_configs" ADD CONSTRAINT "property_operational_configs_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "property_billing_infos" ADD CONSTRAINT "property_billing_infos_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "property_contacts" ADD CONSTRAINT "property_contacts_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "positions" ADD CONSTRAINT "positions_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "positions" ADD CONSTRAINT "positions_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "rate_configurations" ADD CONSTRAINT "rate_configurations_position_id_fkey" FOREIGN KEY ("position_id") REFERENCES "positions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "employee_assignments" ADD CONSTRAINT "employee_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "employee_assignments" ADD CONSTRAINT "employee_assignments_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "employee_assignments" ADD CONSTRAINT "employee_assignments_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "employee_assignments" ADD CONSTRAINT "employee_assignments_position_id_fkey" FOREIGN KEY ("position_id") REFERENCES "positions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "employee_assignments" ADD CONSTRAINT "employee_assignments_rate_configuration_id_fkey" FOREIGN KEY ("rate_configuration_id") REFERENCES "rate_configurations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "user_property_accesses" ADD CONSTRAINT "user_property_accesses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_property_accesses" ADD CONSTRAINT "user_property_accesses_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "work_shifts" ADD CONSTRAINT "work_shifts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "work_shifts" ADD CONSTRAINT "work_shifts_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "work_shifts" ADD CONSTRAINT "work_shifts_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "work_shifts" ADD CONSTRAINT "work_shifts_position_id_fkey" FOREIGN KEY ("position_id") REFERENCES "positions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "work_shifts" ADD CONSTRAINT "work_shifts_rate_configuration_id_fkey" FOREIGN KEY ("rate_configuration_id") REFERENCES "rate_configurations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "attendance_logs" ADD CONSTRAINT "attendance_logs_work_shift_id_fkey" FOREIGN KEY ("work_shift_id") REFERENCES "work_shifts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "time_correction_requests" ADD CONSTRAINT "time_correction_requests_attendance_log_id_fkey" FOREIGN KEY ("attendance_log_id") REFERENCES "attendance_logs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "time_correction_requests" ADD CONSTRAINT "time_correction_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "time_correction_requests" ADD CONSTRAINT "time_correction_requests_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "time_correction_requests" ADD CONSTRAINT "time_correction_requests_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "time_correction_requests" ADD CONSTRAINT "time_correction_requests_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "approval_workflows" ADD CONSTRAINT "approval_workflows_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "approval_steps" ADD CONSTRAINT "approval_steps_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "timesheet_periods" ADD CONSTRAINT "timesheet_periods_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "timesheets" ADD CONSTRAINT "timesheets_timesheet_period_id_fkey" FOREIGN KEY ("timesheet_period_id") REFERENCES "timesheet_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "timesheets" ADD CONSTRAINT "timesheets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "timesheets" ADD CONSTRAINT "timesheets_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "timesheet_approval_histories" ADD CONSTRAINT "timesheet_approval_histories_timesheet_id_fkey" FOREIGN KEY ("timesheet_id") REFERENCES "timesheets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "timesheet_approval_histories" ADD CONSTRAINT "timesheet_approval_histories_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
