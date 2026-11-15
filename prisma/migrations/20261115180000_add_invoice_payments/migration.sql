-- Pagamento de fatura do cartão de crédito.
-- O pagamento é uma transação do tipo INVOICE_PAYMENT que tira o valor da
-- conta. As compras da fatura apontam para ele (invoice_payment_id) e ficam
-- pagas; excluir o pagamento volta as compras para pendente.
-- Nenhuma tabela nova: o RLS da tabela transactions continua valendo.

-- AlterEnum
ALTER TYPE "transaction_type" ADD VALUE 'INVOICE_PAYMENT';

-- AlterTable
ALTER TABLE "transactions" ADD COLUMN     "invoice_due_date" TIMESTAMP(3),
ADD COLUMN     "invoice_payment_id" UUID;

-- CreateIndex
CREATE INDEX "transactions_invoice_payment_id_idx" ON "transactions"("invoice_payment_id");

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_invoice_payment_id_fkey" FOREIGN KEY ("invoice_payment_id") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

