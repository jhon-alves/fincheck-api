export const PAYMENT_METHODS = [
  'ACCOUNT',
  'CREDIT_CARD',
  'DEBIT_CARD',
  'PIX',
  'CASH',
] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const isCardPaymentMethod = (method: PaymentMethod) =>
  method === 'CREDIT_CARD' || method === 'DEBIT_CARD';
