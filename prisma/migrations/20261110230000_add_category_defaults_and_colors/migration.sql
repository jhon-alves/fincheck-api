-- AlterTable
ALTER TABLE "categories" ADD COLUMN     "color" TEXT,
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "is_default" BOOLEAN NOT NULL DEFAULT false;

-- Marca como padrão as categorias criadas no signup: mesmo (nome, ícone, tipo)
-- de DEFAULT_CATEGORIES (src/modules/categories/default-categories.ts).
UPDATE "categories" SET "is_default" = true
WHERE ("name", "icon", "type"::text) IN (
  ('Salário', 'salary', 'INCOME'),
  ('Freelance', 'freelance', 'INCOME'),
  ('Outro', 'other', 'INCOME'),
  ('Casa', 'home', 'EXPENSE'),
  ('Alimentação', 'food', 'EXPENSE'),
  ('Educação', 'education', 'EXPENSE'),
  ('Lazer', 'fun', 'EXPENSE'),
  ('Mercado', 'grocery', 'EXPENSE'),
  ('Roupas', 'clothes', 'EXPENSE'),
  ('Transporte', 'transport', 'EXPENSE'),
  ('Viagem', 'travel', 'EXPENSE'),
  ('Outro', 'other', 'EXPENSE')
);

-- Antes do índice único: se um usuário tiver nomes repetidos no mesmo tipo
-- (sem diferenciar maiúsculas), mantém o primeiro (a padrão, se houver) e
-- renomeia os demais para "Nome (2)", "Nome (3)"... As renomeadas deixam de
-- ser padrão, para o usuário poder editá-las ou excluí-las.
WITH ranked AS (
  SELECT "id",
         row_number() OVER (
           PARTITION BY "user_id", "type", lower("name")
           ORDER BY "is_default" DESC, "id"
         ) AS rn
  FROM "categories"
)
UPDATE "categories" AS c
SET "name" = c."name" || ' (' || r.rn || ')',
    "is_default" = false
FROM ranked AS r
WHERE c."id" = r."id" AND r.rn > 1;

-- CreateIndex
CREATE UNIQUE INDEX "categories_user_id_type_name_key" ON "categories"("user_id", "type", "name");
