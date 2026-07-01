import { z } from 'zod';

export const createTransferSchema = z
  .object({
    fromBankAccountId: z.uuid(),
    toBankAccountId: z.uuid(),
    name: z.string().min(1).optional(),
    value: z.number().positive('O valor precisa ser positivo'),
    date: z.iso.datetime({ message: 'date precisa ser uma data ISO válida' }),
  })
  .refine((data) => data.fromBankAccountId !== data.toBankAccountId, {
    message: 'As contas de origem e destino precisam ser diferentes',
    path: ['toBankAccountId'],
  });

export const transferIdParamSchema = z.object({
  transferId: z.uuid(),
});

export type CreateTransferBody = z.infer<typeof createTransferSchema>;
