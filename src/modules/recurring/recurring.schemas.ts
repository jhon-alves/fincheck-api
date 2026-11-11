import { z } from 'zod';
import { dateOnlySchema } from '../../lib/dates';
import { PAYMENT_METHODS, isCardPaymentMethod } from '../transactions/payment-methods';

/** Como a regra se repete. Também é o campo `recurrence` de POST /transactions. */
export const recurrenceSchema = z
  .object({
    frequency: z.enum(['WEEKLY', 'MONTHLY', 'YEARLY']).default('MONTHLY'),
    dayRule: z.enum(['FIXED_DAY', 'BUSINESS_DAY']).default('FIXED_DAY'),
    /** FIXED_DAY: 1–31 (31 vira o último dia do mês). Sem ele, usa o dia do início. */
    dayOfMonth: z.number().int().min(1).max(31).nullish(),
    /** BUSINESS_DAY: N-ésimo dia útil (ex.: 5). */
    businessDayN: z.number().int().min(1).max(23).nullish(),
    endDate: dateOnlySchema.nullish(),
    maxOccurrences: z.number().int().min(1).max(600).nullish(),
    autoConfirm: z.boolean().default(false),
  })
  .superRefine((data, ctx) => {
    if (data.dayRule === 'BUSINESS_DAY') {
      if (data.frequency !== 'MONTHLY') {
        ctx.addIssue({
          code: 'custom',
          path: ['dayRule'],
          message: 'Dia útil só vale para recorrências mensais',
        });
      }
      if (!data.businessDayN) {
        ctx.addIssue({
          code: 'custom',
          path: ['businessDayN'],
          message: 'Informe qual dia útil (ex.: 5º)',
        });
      }
    }
  });

export type RecurrenceBody = z.infer<typeof recurrenceSchema>;

export const ruleBodySchema = z
  .object({
    type: z.enum(['INCOME', 'EXPENSE'], { message: 'O tipo precisa ser INCOME ou EXPENSE' }),
    name: z.string().trim().min(1, 'O nome é obrigatório').max(120),
    value: z.number().positive('O valor precisa ser positivo'),
    categoryId: z.uuid('Categoria inválida'),
    paymentMethod: z.enum(PAYMENT_METHODS).default('ACCOUNT'),
    bankAccountId: z.uuid('Conta inválida').nullish(),
    cardId: z.uuid('Cartão inválido').nullish(),
    notes: z.string().trim().max(500).nullish(),
    startDate: dateOnlySchema,
    recurrence: recurrenceSchema,
  })
  .superRefine((data, ctx) => {
    if (isCardPaymentMethod(data.paymentMethod) && !data.cardId) {
      ctx.addIssue({ code: 'custom', path: ['cardId'], message: 'Selecione o cartão' });
    }
    if (!isCardPaymentMethod(data.paymentMethod) && !data.bankAccountId) {
      ctx.addIssue({ code: 'custom', path: ['bankAccountId'], message: 'Selecione a conta' });
    }
    if (data.recurrence.endDate && data.recurrence.endDate < data.startDate) {
      ctx.addIssue({
        code: 'custom',
        path: ['recurrence', 'endDate'],
        message: 'O fim precisa ser depois do início',
      });
    }
  });

export type RuleBody = z.infer<typeof ruleBodySchema>;

export const ruleIdParamSchema = z.object({ ruleId: z.uuid() });

export const endRuleSchema = z.object({
  /** end: encerra a partir de `date` (padrão: hoje); pause/resume: pausa ou reativa. */
  action: z.enum(['end', 'pause', 'resume']),
  date: dateOnlySchema.optional(),
});

export type EndRuleBody = z.infer<typeof endRuleSchema>;
