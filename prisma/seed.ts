/*
 * Dados de demonstração para desenvolvimento local.
 *
 *   npm run seed
 *
 * Cria (ou recria) o usuário demo abaixo com contas, cartões e lançamentos
 * espalhados pelos últimos meses — inclusive compras parceladas — para testar
 * o dashboard, o extrato e o calendário. Rode só contra um banco de
 * desenvolvimento: o usuário demo é apagado e criado de novo a cada execução.
 *
 * Login: demo@fincheck.local / fincheck-demo
 */
import { randomUUID } from 'node:crypto';
import { hash } from 'bcryptjs';
import { PrismaClient, type Prisma } from '@prisma/client';
import { buildInstallments } from '../src/modules/transactions/installments';
import { DEFAULT_CATEGORIES } from '../src/modules/categories/default-categories';

const prisma = new PrismaClient();

const DEMO_EMAIL = 'demo@fincheck.local';
const DEMO_PASSWORD = 'fincheck-demo';

const noon = (year: number, month: number, day: number) =>
  new Date(Date.UTC(year, month, day, 12));

async function main() {
  await prisma.user.deleteMany({ where: { email: DEMO_EMAIL } });

  const user = await prisma.user.create({
    data: {
      name: 'Marina Duarte',
      email: DEMO_EMAIL,
      password: await hash(DEMO_PASSWORD, 12),
      categories: { createMany: { data: DEFAULT_CATEGORIES } },
    },
    include: { categories: true },
  });

  const category = (icon: string, type: 'INCOME' | 'EXPENSE') =>
    user.categories.find((c) => c.icon === icon && c.type === type)!.id;

  const [nubank, inter, cash] = await Promise.all([
    prisma.bankAccount.create({
      data: { userId: user.id, name: 'Nubank', initialBalance: 3200, type: 'CHECKING', color: '#7950F2' },
    }),
    prisma.bankAccount.create({
      data: { userId: user.id, name: 'Inter Invest', initialBalance: 12500, type: 'INVESTMENT', color: '#FD7E14' },
    }),
    prisma.bankAccount.create({
      data: { userId: user.id, name: 'Carteira', initialBalance: 180, type: 'CASH', color: '#40C057' },
    }),
  ]);

  const [roxinho, black, debit] = await Promise.all([
    prisma.card.create({
      data: {
        userId: user.id, bankAccountId: nubank.id, name: 'Roxinho', holderName: 'MARINA DUARTE',
        lastDigits: '4821', brand: 'MASTERCARD', kind: 'CREDIT', color: 'violet',
        expMonth: 8, expYear: 2031, creditLimit: 6500, closingDay: 3, dueDay: 10,
      },
    }),
    prisma.card.create({
      data: {
        userId: user.id, bankAccountId: nubank.id, name: 'Viagens', holderName: 'MARINA DUARTE',
        lastDigits: '0457', brand: 'VISA', kind: 'CREDIT', color: 'midnight',
        expMonth: 2, expYear: 2030, creditLimit: 12000, closingDay: 25, dueDay: 5,
      },
    }),
    prisma.card.create({
      data: {
        userId: user.id, bankAccountId: nubank.id, name: 'Débito Elo', holderName: 'MARINA DUARTE',
        lastDigits: '7713', brand: 'ELO', kind: 'DEBIT', color: 'lime',
        expMonth: 11, expYear: 2029,
      },
    }),
  ]);

  const today = new Date();
  const year = today.getUTCFullYear();
  const month = today.getUTCMonth();
  const transactions: Prisma.TransactionCreateManyInput[] = [];

  // Seis meses de histórico: salário, contas fixas e gastos do dia a dia.
  for (let offset = -5; offset <= 0; offset++) {
    const ref = new Date(Date.UTC(year, month + offset, 1));
    const y = ref.getUTCFullYear();
    const m = ref.getUTCMonth();
    const isCurrent = offset === 0;
    const day = (d: number) => noon(y, m, d);
    const pastOrToday = (d: number) => !isCurrent || d <= today.getUTCDate();

    transactions.push(
      { userId: user.id, bankAccountId: nubank.id, categoryId: category('salary', 'INCOME'), name: 'Salário', value: 8400, date: day(5), type: 'INCOME', paymentMethod: 'PIX', paid: pastOrToday(5) },
      { userId: user.id, bankAccountId: nubank.id, categoryId: category('home', 'EXPENSE'), name: 'Aluguel', value: 2350, date: day(8), type: 'EXPENSE', paymentMethod: 'ACCOUNT', paid: pastOrToday(8) },
      { userId: user.id, bankAccountId: nubank.id, categoryId: category('home', 'EXPENSE'), name: 'Internet e luz', value: 289.9 + offset * 7, date: day(15), type: 'EXPENSE', paymentMethod: 'PIX', paid: pastOrToday(15) },
      { userId: user.id, cardId: roxinho.id, categoryId: category('grocery', 'EXPENSE'), name: 'Mercado do mês', value: 742.35 - offset * 31, date: day(12), type: 'EXPENSE', paymentMethod: 'CREDIT_CARD', paid: !isCurrent },
      { userId: user.id, cardId: roxinho.id, categoryId: category('food', 'EXPENSE'), name: 'iFood', value: 86.4 + (offset % 2) * 20, date: day(18), type: 'EXPENSE', paymentMethod: 'CREDIT_CARD', paid: !isCurrent },
      { userId: user.id, bankAccountId: nubank.id, cardId: debit.id, categoryId: category('transport', 'EXPENSE'), name: 'Uber', value: 34.9 - offset * 2, date: day(21), type: 'EXPENSE', paymentMethod: 'DEBIT_CARD', paid: pastOrToday(21) },
      { userId: user.id, bankAccountId: cash.id, categoryId: category('food', 'EXPENSE'), name: 'Feira', value: 62, date: day(23), type: 'EXPENSE', paymentMethod: 'CASH', paid: pastOrToday(23) },
    );

    if (offset % 2 === 0) {
      transactions.push({ userId: user.id, bankAccountId: inter.id, categoryId: category('freelance', 'INCOME'), name: 'Projeto freelance', value: 1800, date: day(20), type: 'INCOME', paymentMethod: 'PIX', paid: pastOrToday(20) });
    }
    if (offset === -2) {
      transactions.push({ userId: user.id, bankAccountId: nubank.id, categoryId: category('fun', 'EXPENSE'), name: 'Show', value: 340, date: day(9), type: 'EXPENSE', paymentMethod: 'PIX', paid: true });
    }
  }

  // Hoje e ontem, para o extrato ter "Hoje" e "Ontem".
  transactions.push(
    { userId: user.id, cardId: roxinho.id, categoryId: category('food', 'EXPENSE'), name: 'Café com a equipe', value: 48.5, date: noon(year, month, today.getUTCDate()), type: 'EXPENSE', paymentMethod: 'CREDIT_CARD', paid: false, notes: 'Dividido em 3' },
    { userId: user.id, bankAccountId: nubank.id, cardId: debit.id, categoryId: category('grocery', 'EXPENSE'), name: 'Padaria', value: 23.8, date: noon(year, month, today.getUTCDate() - 1), type: 'EXPENSE', paymentMethod: 'DEBIT_CARD', paid: true },
  );

  // Transferência para a reserva.
  transactions.push({ userId: user.id, bankAccountId: nubank.id, toBankAccountId: inter.id, name: 'Reserva de emergência', value: 1000, date: noon(year, month, 6), type: 'TRANSFER', paymentMethod: 'ACCOUNT', paid: true });

  // Compras parceladas no crédito (aparecem nos meses seguintes).
  const installmentPurchases = [
    { card: roxinho, name: 'Notebook', total: 4299, count: 10, date: noon(year, month - 2, 10), icon: 'education' },
    { card: black, name: 'Passagens Lisboa', total: 3890, count: 6, date: noon(year, month - 1, 27), icon: 'travel' },
    { card: roxinho, name: 'Tênis de corrida', total: 699.9, count: 3, date: noon(year, month, 2), icon: 'clothes' },
  ];

  for (const purchase of installmentPurchases) {
    const groupId = randomUUID();
    const purchaseIsPastMonth = purchase.date < noon(year, month, 1);

    for (const installment of buildInstallments(purchase.total, purchase.count, purchase.date)) {
      transactions.push({
        userId: user.id,
        cardId: purchase.card.id,
        categoryId: category(purchase.icon, 'EXPENSE'),
        name: purchase.name,
        value: installment.value,
        date: installment.date,
        type: 'EXPENSE',
        paymentMethod: 'CREDIT_CARD',
        paid: purchaseIsPastMonth && installment.date < noon(year, month, 1),
        installmentGroupId: groupId,
        installmentNumber: installment.number,
        installmentsTotal: purchase.count,
      });
    }
  }

  // Um boleto parcelado na conta, com parcelas pendentes nos próximos dias.
  const courseGroup = randomUUID();
  for (const installment of buildInstallments(1200, 4, noon(year, month, Math.min(today.getUTCDate() + 3, 28)))) {
    transactions.push({
      userId: user.id,
      bankAccountId: nubank.id,
      categoryId: category('education', 'EXPENSE'),
      name: 'Curso de inglês',
      value: installment.value,
      date: installment.date,
      type: 'EXPENSE',
      paymentMethod: 'ACCOUNT',
      paid: false,
      installmentGroupId: courseGroup,
      installmentNumber: installment.number,
      installmentsTotal: 4,
    });
  }

  await prisma.transaction.createMany({ data: transactions });

  console.log(`Seed ok: ${transactions.length} lançamentos para ${DEMO_EMAIL}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
