import { badRequest } from '../../lib/errors';
import { validateBankAccountOwnership } from '../bank-accounts/validate-ownership';
import { validateCardOwnership } from '../cards/validate-ownership';
import { validateCategoryOwnership } from '../categories/validate-ownership';
import { isCardPaymentMethod, type PaymentMethod } from './payment-methods';

export interface PaymentInput {
  type: 'INCOME' | 'EXPENSE';
  categoryId: string;
  paymentMethod: PaymentMethod;
  cardId?: string | null;
  bankAccountId?: string | null;
}

/**
 * Valida categoria, conta e cartão e resolve de onde o dinheiro sai:
 * - Crédito: fica só no cartão (`bankAccountId` nulo) e não mexe no saldo.
 * - Débito: sai da conta vinculada ao cartão.
 * - Conta, Pix e dinheiro: saem da conta informada.
 *
 * `currentCardId` permite editar um lançamento de um cartão que foi arquivado
 * depois, sem trocar de cartão.
 */
export async function resolvePayment(
  userId: string,
  input: PaymentInput,
  currentCardId?: string | null,
) {
  const category = await validateCategoryOwnership(userId, input.categoryId);

  if (category.type !== input.type) {
    throw badRequest('A categoria não corresponde ao tipo do lançamento');
  }

  if (isCardPaymentMethod(input.paymentMethod)) {
    const card = await validateCardOwnership(userId, input.cardId!);
    const isCredit = input.paymentMethod === 'CREDIT_CARD';

    if (card.archived && card.id !== currentCardId) {
      throw badRequest('Este cartão está arquivado');
    }

    if (isCredit && card.kind !== 'CREDIT') {
      throw badRequest('O cartão selecionado não é de crédito');
    }

    if (!isCredit && card.kind !== 'DEBIT') {
      throw badRequest('O cartão selecionado não é de débito');
    }

    if (isCredit) {
      return {
        paymentMethod: input.paymentMethod,
        cardId: card.id,
        bankAccountId: null,
      };
    }

    if (!card.bankAccountId) {
      throw badRequest(
        'Vincule uma conta a este cartão de débito antes de usá-lo',
      );
    }

    return {
      paymentMethod: input.paymentMethod,
      cardId: card.id,
      bankAccountId: card.bankAccountId,
    };
  }

  await validateBankAccountOwnership(userId, input.bankAccountId!);

  return {
    paymentMethod: input.paymentMethod,
    cardId: null,
    bankAccountId: input.bankAccountId!,
  };
}

