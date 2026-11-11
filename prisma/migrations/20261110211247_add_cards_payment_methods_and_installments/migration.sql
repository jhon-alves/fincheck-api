-- CreateEnum
CREATE TYPE "payment_method" AS ENUM ('ACCOUNT', 'CREDIT_CARD', 'DEBIT_CARD', 'PIX', 'CASH');

-- CreateEnum
CREATE TYPE "card_brand" AS ENUM ('VISA', 'MASTERCARD', 'ELO', 'AMEX', 'HIPERCARD', 'DINERS', 'DISCOVER', 'JCB', 'OTHER');

-- CreateEnum
CREATE TYPE "card_kind" AS ENUM ('CREDIT', 'DEBIT');

-- AlterTable
ALTER TABLE "transactions" ADD COLUMN     "card_id" UUID,
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "installment_group_id" UUID,
ADD COLUMN     "installment_number" INTEGER,
ADD COLUMN     "installments_total" INTEGER,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "payment_method" "payment_method" NOT NULL DEFAULT 'ACCOUNT',
ALTER COLUMN "bank_account_id" DROP NOT NULL;

-- CreateTable
CREATE TABLE "cards" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "bank_account_id" UUID,
    "name" TEXT NOT NULL,
    "holder_name" TEXT NOT NULL,
    "last_digits" VARCHAR(4) NOT NULL,
    "brand" "card_brand" NOT NULL,
    "kind" "card_kind" NOT NULL,
    "color" TEXT NOT NULL,
    "exp_month" INTEGER NOT NULL,
    "exp_year" INTEGER NOT NULL,
    "credit_limit" DOUBLE PRECISION,
    "closing_day" INTEGER,
    "due_day" INTEGER,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cards_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cards_user_id_idx" ON "cards"("user_id");

-- CreateIndex
CREATE INDEX "transactions_user_id_date_idx" ON "transactions"("user_id", "date");

-- CreateIndex
CREATE INDEX "transactions_installment_group_id_idx" ON "transactions"("installment_group_id");

-- CreateIndex
CREATE INDEX "transactions_card_id_idx" ON "transactions"("card_id");

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cards" ADD CONSTRAINT "cards_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cards" ADD CONSTRAINT "cards_bank_account_id_fkey" FOREIGN KEY ("bank_account_id") REFERENCES "bank_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
