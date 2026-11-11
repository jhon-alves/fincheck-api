import { prisma } from '../../lib/prisma';
import { validateBankAccountOwnership } from './validate-ownership';
import type {
  CreateBankAccountBody,
  UpdateBankAccountBody,
} from './bank-accounts.schemas';

export function create(userId: string, data: CreateBankAccountBody) {
  return prisma.bankAccount.create({
    data: { userId, ...data },
  });
}

export async function findAllByUserId(userId: string) {
  const bankAccounts = await prisma.bankAccount.findMany({
    where: { userId },
    include: {
      // Movimentos em que esta conta é a origem (receitas, despesas e
      // transferências de saída). Só entra o que já foi pago/recebido:
      // previstos (recorrentes, parcelas futuras) não mexem no saldo atual.
      // Compras no crédito também ficam de fora: o saldo só muda quando a
      // fatura é paga.
      transactions: {
        where: { paid: true, paymentMethod: { not: 'CREDIT_CARD' } },
        select: { value: true, type: true },
      },
      // Transferências recebidas (esta conta é o destino).
      incomingTransfers: {
        where: { paid: true },
        select: { value: true },
      },
    },
  });

  return bankAccounts.map(
    ({ transactions, incomingTransfers, ...bankAccount }) => {
      const outgoing = transactions.reduce((acc, transaction) => {
        // INCOME entra; EXPENSE e TRANSFER (saída) saem.
        return transaction.type === 'INCOME'
          ? acc + transaction.value
          : acc - transaction.value;
      }, 0);

      const incoming = incomingTransfers.reduce(
        (acc, transfer) => acc + transfer.value,
        0,
      );

      const currentBalance = bankAccount.initialBalance + outgoing + incoming;

      return { ...bankAccount, currentBalance };
    },
  );
}

export async function update(
  userId: string,
  bankAccountId: string,
  data: UpdateBankAccountBody,
) {
  await validateBankAccountOwnership(userId, bankAccountId);

  return prisma.bankAccount.update({
    where: { id: bankAccountId },
    data,
  });
}

export async function remove(userId: string, bankAccountId: string) {
  await validateBankAccountOwnership(userId, bankAccountId);

  await prisma.bankAccount.delete({ where: { id: bankAccountId } });
}
