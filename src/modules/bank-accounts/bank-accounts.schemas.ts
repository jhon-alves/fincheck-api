import { z } from 'zod';

export const createBankAccountSchema = z.object({
  name: z.string().min(1, 'O nome é obrigatório'),
  initialBalance: z.number({ message: 'initialBalance precisa ser um número' }),
  type: z.enum(['CHECKING', 'INVESTMENT', 'CASH']),
  color: z
    .string()
    .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'A cor precisa ser um hex válido'),
});

export const updateBankAccountSchema = createBankAccountSchema;

export const bankAccountIdParamSchema = z.object({
  bankAccountId: z.uuid(),
});

export type CreateBankAccountBody = z.infer<typeof createBankAccountSchema>;
export type UpdateBankAccountBody = z.infer<typeof updateBankAccountSchema>;
