import { z } from 'zod';
import { dateOnlySchema } from '../../lib/dates';

export const createTransferSchema = z
  .object({
    fromBankAccountId: z.uuid(),
    toBankAccountId: z.uuid(),
    name: z.string().trim().min(1).optional(),
    value: z.number().positive('O valor precisa ser positivo'),
    date: dateOnlySchema,
    notes: z
      .string()
      .trim()
      .max(500, 'A observação pode ter no máximo 500 caracteres')
      .nullish(),
  })
  .refine((data) => data.fromBankAccountId !== data.toBankAccountId, {
    message: 'As contas de origem e destino precisam ser diferentes',
    path: ['toBankAccountId'],
  });

export const updateTransferSchema = createTransferSchema;

export const transferIdParamSchema = z.object({
  transferId: z.uuid(),
});

export type CreateTransferBody = z.infer<typeof createTransferSchema>;
export type UpdateTransferBody = z.infer<typeof updateTransferSchema>;
