import { z } from 'zod';
import { dateOnlySchema } from '../../lib/dates';

export const CARD_BRANDS = [
  'VISA',
  'MASTERCARD',
  'ELO',
  'AMEX',
  'HIPERCARD',
  'DINERS',
  'DISCOVER',
  'JCB',
  'OTHER',
] as const;

export const CARD_KINDS = ['CREDIT', 'DEBIT'] as const;

const dayOfMonth = (label: string) =>
  z
    .number({ message: `Informe o dia de ${label}` })
    .int(`O dia de ${label} precisa ser um número inteiro`)
    .min(1, `O dia de ${label} precisa estar entre 1 e 31`)
    .max(31, `O dia de ${label} precisa estar entre 1 e 31`);

/*
 * `strictObject`: qualquer campo desconhecido (ex.: `number`, `cvv`) derruba a
 * requisição com 400. O número completo e o CVV nunca devem sair do front —
 * se um dia saírem por engano, a API recusa em vez de ignorar em silêncio.
 */
const cardBodySchema = z.strictObject({
  name: z.string().trim().min(1, 'O apelido é obrigatório').max(40),
  holderName: z
    .string()
    .trim()
    .min(1, 'O nome impresso é obrigatório')
    .max(60),
  lastDigits: z
    .string()
    .regex(/^\d{4}$/, 'Informe os 4 últimos dígitos do cartão'),
  brand: z.enum(CARD_BRANDS, { message: 'Bandeira inválida' }),
  kind: z.enum(CARD_KINDS, { message: 'Informe se o cartão é de crédito ou débito' }),
  color: z
    .string()
    .regex(
      /^(#[0-9a-fA-F]{6}|[a-z0-9-]{1,32})$/,
      'A cor precisa ser um hex (#RRGGBB) ou o id de um gradiente',
    ),
  expMonth: z
    .number({ message: 'Informe o mês de validade' })
    .int()
    .min(1, 'Mês de validade inválido')
    .max(12, 'Mês de validade inválido'),
  expYear: z
    .number({ message: 'Informe o ano de validade' })
    .int()
    .min(2000, 'Ano de validade inválido')
    .max(2100, 'Ano de validade inválido'),
  bankAccountId: z.uuid('Conta vinculada inválida').nullish(),
  creditLimit: z
    .number({ message: 'O limite precisa ser um número' })
    .positive('O limite precisa ser maior que zero')
    .nullish(),
  closingDay: dayOfMonth('fechamento').nullish(),
  dueDay: dayOfMonth('vencimento').nullish(),
  archived: z.boolean().optional(),
});

type CardBody = z.infer<typeof cardBodySchema>;

function refineCardBody(data: CardBody, ctx: z.RefinementCtx) {
  if (data.kind === 'CREDIT') {
    if (data.creditLimit == null) {
      ctx.addIssue({
        code: 'custom',
        path: ['creditLimit'],
        message: 'Informe o limite do cartão de crédito',
      });
    }
    if (data.closingDay == null) {
      ctx.addIssue({
        code: 'custom',
        path: ['closingDay'],
        message: 'Informe o dia de fechamento da fatura',
      });
    }
    if (data.dueDay == null) {
      ctx.addIssue({
        code: 'custom',
        path: ['dueDay'],
        message: 'Informe o dia de vencimento da fatura',
      });
    }
  }

  if (data.kind === 'DEBIT' && !data.bankAccountId) {
    ctx.addIssue({
      code: 'custom',
      path: ['bankAccountId'],
      message: 'O cartão de débito precisa de uma conta vinculada',
    });
  }
}

export const createCardSchema = cardBodySchema.superRefine(refineCardBody);

export const updateCardSchema = createCardSchema;

export const cardIdParamSchema = z.object({
  cardId: z.uuid(),
});

export const cardFiltersSchema = z.object({
  includeArchived: z.stringbool().optional(),
});

export type CreateCardBody = z.infer<typeof createCardSchema>;
export type UpdateCardBody = z.infer<typeof updateCardSchema>;
export type CardFilters = z.infer<typeof cardFiltersSchema>;

/**
 * Qual fatura: `dueDate` (qualquer dia do mês do vencimento) ou `purchaseDate`
 * (a fatura em que uma compra feita nesse dia cai).
 */
export const invoiceQuerySchema = z
  .object({
    dueDate: dateOnlySchema.optional(),
    purchaseDate: dateOnlySchema.optional(),
  })
  .refine((query) => !!query.dueDate !== !!query.purchaseDate, {
    message: 'Informe dueDate ou purchaseDate',
  });

export const payInvoiceSchema = z.strictObject({
  dueDate: dateOnlySchema,
  /** Conta de onde o pagamento sai. */
  bankAccountId: z.uuid('Escolha a conta que paga a fatura'),
  /** Dia em que a fatura foi paga. */
  date: dateOnlySchema,
});

export type InvoiceQuery = z.infer<typeof invoiceQuerySchema>;
export type PayInvoiceBody = z.infer<typeof payInvoiceSchema>;
