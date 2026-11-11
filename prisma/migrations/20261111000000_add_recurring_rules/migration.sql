-- CreateEnum
CREATE TYPE "recurrence_frequency" AS ENUM ('WEEKLY', 'MONTHLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "recurrence_day_rule" AS ENUM ('FIXED_DAY', 'BUSINESS_DAY');

-- AlterTable
ALTER TABLE "transactions" ADD COLUMN     "is_detached" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "occurrence_date" TIMESTAMP(3),
ADD COLUMN     "recurring_rule_id" UUID;

-- CreateTable
CREATE TABLE "recurring_rules" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" "transaction_type" NOT NULL,
    "name" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "category_id" UUID,
    "bank_account_id" UUID,
    "card_id" UUID,
    "payment_method" "payment_method" NOT NULL DEFAULT 'ACCOUNT',
    "frequency" "recurrence_frequency" NOT NULL DEFAULT 'MONTHLY',
    "day_rule" "recurrence_day_rule" NOT NULL DEFAULT 'FIXED_DAY',
    "day_of_month" INTEGER,
    "business_day_n" INTEGER,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3),
    "max_occurrences" INTEGER,
    "auto_confirm" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "generated_until" TIMESTAMP(3),
    "skipped_dates" TIMESTAMP(3)[] DEFAULT ARRAY[]::TIMESTAMP(3)[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recurring_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "recurring_rules_user_id_idx" ON "recurring_rules"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_recurring_rule_id_occurrence_date_key" ON "transactions"("recurring_rule_id", "occurrence_date");

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_recurring_rule_id_fkey" FOREIGN KEY ("recurring_rule_id") REFERENCES "recurring_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_rules" ADD CONSTRAINT "recurring_rules_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_rules" ADD CONSTRAINT "recurring_rules_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_rules" ADD CONSTRAINT "recurring_rules_bank_account_id_fkey" FOREIGN KEY ("bank_account_id") REFERENCES "bank_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_rules" ADD CONSTRAINT "recurring_rules_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

