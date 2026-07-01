import { z } from 'zod';

export const createTransactionSchema = z.object({
  bankAccountId: z.uuid(),
  categoryId: z.uuid(),
  name: z.string().min(1, 'O nome é obrigatório'),
  value: z.number().positive('O valor precisa ser positivo'),
  date: z.iso.datetime({ message: 'date precisa ser uma data ISO válida' }),
  type: z.enum(['INCOME', 'EXPENSE']),
  paid: z.boolean().default(true),
});

export const updateTransactionSchema = createTransactionSchema;

export const transactionIdParamSchema = z.object({
  transactionId: z.uuid(),
});

export const transactionFiltersSchema = z.object({
  month: z.coerce.number().int().min(0).max(11),
  year: z.coerce.number().int(),
  bankAccountId: z.uuid().optional(),
  type: z.enum(['INCOME', 'EXPENSE']).optional(),
});

export type CreateTransactionBody = z.infer<typeof createTransactionSchema>;
export type UpdateTransactionBody = z.infer<typeof updateTransactionSchema>;
export type TransactionFilters = z.infer<typeof transactionFiltersSchema>;
