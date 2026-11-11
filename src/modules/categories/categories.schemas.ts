import { z } from 'zod';

const slug = (message: string) =>
  z.string().regex(/^[a-z0-9-]{1,40}$/, message);

export const createCategorySchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'O nome é obrigatório')
    .max(40, 'Use até 40 caracteres'),
  type: z.enum(['INCOME', 'EXPENSE'], {
    message: 'O tipo precisa ser INCOME ou EXPENSE',
  }),
  /** Chave do ícone no front (ex.: "paw-print"). */
  icon: slug('Ícone inválido'),
  /** Chave da paleta do front (ex.: "violet"). */
  color: slug('Cor inválida').nullish(),
});

export const updateCategorySchema = createCategorySchema;

export const categoryIdParamSchema = z.object({
  categoryId: z.uuid(),
});

export const deleteCategoryQuerySchema = z.object({
  /** Para onde vão os lançamentos antes de excluir (obrigatório se houver). */
  moveToCategoryId: z.uuid('Categoria de destino inválida').optional(),
});

export type CreateCategoryBody = z.infer<typeof createCategorySchema>;
export type UpdateCategoryBody = z.infer<typeof updateCategorySchema>;
