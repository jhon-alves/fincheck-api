import { z } from 'zod';
import { dateOnlySchema } from '../../lib/dates';

export const summaryFiltersSchema = z.object({
  month: z.coerce
    .number()
    .int()
    .min(0, 'O mês vai de 0 (janeiro) a 11 (dezembro)')
    .max(11, 'O mês vai de 0 (janeiro) a 11 (dezembro)'),
  year: z.coerce.number().int().min(1900).max(2200),
  /**
   * "Hoje" no fuso do usuário (YYYY-MM-DD), para os próximos 7 dias e os
   * últimos lançamentos. Sem ele, usa a data UTC do servidor.
   */
  today: dateOnlySchema.optional(),
});

export type SummaryFilters = z.infer<typeof summaryFiltersSchema>;
