import type { Prisma } from '@prisma/client';

/**
 * Categorias criadas para todo usuário no signup. São fixas: a API não deixa
 * editar nem excluir (isDefault). A migration
 * 20261110230000_add_category_defaults_and_colors marca as existentes pelo
 * mesmo (nome, ícone, tipo). Uma categoria fixa nova também precisa de uma
 * migration que a crie para os usuários que já existem (ex.:
 * 20261115120000_add_company_default_category) e do ícone no front
 * (CategoryIcon).
 */
export const DEFAULT_CATEGORIES: Prisma.CategoryCreateManyUserInput[] = [
  // Entradas
  { name: 'Salário', icon: 'salary', type: 'INCOME', isDefault: true },
  { name: 'Freelance', icon: 'freelance', type: 'INCOME', isDefault: true },
  { name: 'Outro', icon: 'other', type: 'INCOME', isDefault: true },
  // Saídas
  { name: 'Casa', icon: 'home', type: 'EXPENSE', isDefault: true },
  { name: 'Alimentação', icon: 'food', type: 'EXPENSE', isDefault: true },
  { name: 'Educação', icon: 'education', type: 'EXPENSE', isDefault: true },
  { name: 'Empresa', icon: 'company', type: 'EXPENSE', isDefault: true },
  { name: 'Lazer', icon: 'fun', type: 'EXPENSE', isDefault: true },
  { name: 'Mercado', icon: 'grocery', type: 'EXPENSE', isDefault: true },
  { name: 'Roupas', icon: 'clothes', type: 'EXPENSE', isDefault: true },
  { name: 'Transporte', icon: 'transport', type: 'EXPENSE', isDefault: true },
  { name: 'Viagem', icon: 'travel', type: 'EXPENSE', isDefault: true },
  { name: 'Outro', icon: 'other', type: 'EXPENSE', isDefault: true },
];
