import { z } from 'zod';
import { dateOnlySchema } from '../../lib/dates';
import { recurrenceSchema } from '../recurring/recurring.schemas';
import {
  MAX_INSTALLMENTS,
  isInstallmentValueValid,
} from './installments';

import { PAYMENT_METHODS, isCardPaymentMethod } from './payment-methods';

export { PAYMENT_METHODS, isCardPaymentMethod };
export type { PaymentMethod } from './payment-methods';

const baseTransactionSchema = z.object({
  type: z.enum(['INCOME', 'EXPENSE'], {
    message: 'O tipo precisa ser INCOME ou EXPENSE',
  }),
  name: z.string().trim().min(1, 'O nome é obrigatório').max(120),
  date: dateOnlySchema,
  categoryId: z.uuid('Categoria inválida'),
  bankAccountId: z.uuid('Conta inválida').nullish(),
  paymentMethod: z
    .enum(PAYMENT_METHODS, { message: 'Forma de pagamento inválida' })
    .default('ACCOUNT'),
  cardId: z.uuid('Cartão inválido').nullish(),
  /**
   * Sem valor explícito: crédito nasce pendente (só é pago com a fatura) e as
   * demais formas nascem pagas, como antes.
   */
  paid: z.boolean().optional(),
  notes: z
    .string()
    .trim()
    .max(500, 'A observação pode ter no máximo 500 caracteres')
    .nullish(),
});

type BaseTransactionBody = z.infer<typeof baseTransactionSchema>;

/** Regras da forma de pagamento, comuns à criação e à edição. */
function refinePayment(data: BaseTransactionBody, ctx: z.RefinementCtx) {
  if (isCardPaymentMethod(data.paymentMethod)) {
    if (data.type !== 'EXPENSE') {
      ctx.addIssue({
        code: 'custom',
        path: ['paymentMethod'],
        message: 'Pagamentos com cartão só valem para saídas',
      });
    }

    if (!data.cardId) {
      ctx.addIssue({
        code: 'custom',
        path: ['cardId'],
        message: 'Selecione o cartão',
      });
    }

    return;
  }

  if (!data.bankAccountId) {
    ctx.addIssue({
      code: 'custom',
      path: ['bankAccountId'],
      message: 'Selecione a conta',
    });
  }
}

export const createTransactionSchema = baseTransactionSchema
  .extend({
    /** Valor da transação (sem parcelamento). */
    value: z.number().positive('O valor precisa ser positivo').optional(),
    /** Valor total da compra parcelada — o backend divide entre as parcelas. */
    totalValue: z.number().positive('O valor precisa ser positivo').optional(),
    installments: z
      .number()
      .int('A quantidade de parcelas precisa ser um número inteiro')
      .min(1, 'A quantidade de parcelas precisa ser no mínimo 1')
      .max(MAX_INSTALLMENTS, `O parcelamento vai até ${MAX_INSTALLMENTS}x`)
      .default(1),
    /** Lançamento recorrente: cria a regra e as ocorrências da janela. */
    recurrence: recurrenceSchema.optional(),
  })
  .superRefine((data, ctx) => {
    refinePayment(data, ctx);

    if (data.recurrence && data.installments > 1) {
      ctx.addIssue({
        code: 'custom',
        path: ['recurrence'],
        message: 'Recorrência e parcelamento não podem ser usados juntos',
      });
    }

    const amount = data.totalValue ?? data.value;

    if (amount === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['value'],
        message: 'Informe o valor',
      });
      return;
    }

    if (data.installments > 1) {
      if (data.type !== 'EXPENSE') {
        ctx.addIssue({
          code: 'custom',
          path: ['installments'],
          message: 'Só saídas podem ser parceladas',
        });
      }

      if (!isInstallmentValueValid(amount, data.installments)) {
        ctx.addIssue({
          code: 'custom',
          path: ['installments'],
          message: 'Cada parcela precisa valer pelo menos R$ 0,01',
        });
      }
    }
  });

export const updateTransactionSchema = baseTransactionSchema
  .extend({
    /** Valor desta transação (em parcelas, o valor de cada parcela). */
    value: z.number().positive('O valor precisa ser positivo'),
  })
  .superRefine(refinePayment);

/** Corpo opcional de PATCH /transactions/:id/confirm (padrão: confirmar). */
export const confirmBodySchema = z
  .object({ paid: z.boolean().default(true) })
  .default({ paid: true });

export const transactionIdParamSchema = z.object({
  transactionId: z.uuid(),
});

export const installmentGroupParamSchema = z.object({
  installmentGroupId: z.uuid(),
});

/**
 * Escopo de edição/exclusão de parcelas, como no Google Agenda:
 * só esta, esta e as próximas, ou todas.
 */
export const scopeQuerySchema = z.object({
  scope: z
    .enum(['one', 'following', 'all'], {
      message: 'O escopo precisa ser one, following ou all',
    })
    .default('one'),
});

const monthSchema = z.coerce
  .number()
  .int()
  .min(0, 'O mês vai de 0 (janeiro) a 11 (dezembro)')
  .max(11, 'O mês vai de 0 (janeiro) a 11 (dezembro)');

const yearSchema = z.coerce.number().int().min(1900).max(2200);

export const transactionFiltersSchema = z
  .object({
    month: monthSchema.optional(),
    year: yearSchema.optional(),
    from: dateOnlySchema.optional(),
    to: dateOnlySchema.optional(),
    bankAccountId: z.uuid().optional(),
    cardId: z.uuid().optional(),
    categoryId: z.uuid().optional(),
    type: z.enum(['INCOME', 'EXPENSE', 'TRANSFER']).optional(),
    paymentMethod: z.enum(PAYMENT_METHODS).optional(),
    paid: z.stringbool().optional(),
    search: z.string().trim().max(100).optional(),
  })
  .superRefine((data, ctx) => {
    const hasMonth = data.month !== undefined && data.year !== undefined;
    const hasRange = data.from !== undefined && data.to !== undefined;

    if (!hasMonth && !hasRange) {
      ctx.addIssue({
        code: 'custom',
        path: ['month'],
        message: 'Informe month + year ou from + to',
      });
    }

    if (hasRange && data.from! > data.to!) {
      ctx.addIssue({
        code: 'custom',
        path: ['to'],
        message: 'A data final precisa ser igual ou posterior à inicial',
      });
    }
  });

export const calendarFiltersSchema = z.object({
  month: monthSchema,
  year: yearSchema,
});

export type CreateTransactionBody = z.infer<typeof createTransactionSchema>;
export type UpdateTransactionBody = z.infer<typeof updateTransactionSchema>;
export type TransactionFilters = z.infer<typeof transactionFiltersSchema>;
export type CalendarFilters = z.infer<typeof calendarFiltersSchema>;
export type Scope = z.infer<typeof scopeQuerySchema>['scope'];
