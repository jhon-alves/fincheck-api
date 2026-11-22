-- Nova categoria fixa de saída "Empresa" (ícone "company") para os usuários
-- que já existem. Os novos ganham a categoria no signup (DEFAULT_CATEGORIES).

-- Quem já tinha uma categoria de saída chamada "Empresa" (sem diferenciar
-- maiúsculas) fica com ela, que passa a ser fixa, em vez de ganhar uma repetida.
UPDATE "categories"
SET "is_default" = true
WHERE "type" = 'EXPENSE' AND lower("name") = 'empresa';

INSERT INTO "categories" ("id", "user_id", "name", "icon", "type", "is_default")
SELECT gen_random_uuid(), u."id", 'Empresa', 'company', 'EXPENSE', true
FROM "users" u
WHERE NOT EXISTS (
  SELECT 1
  FROM "categories" c
  WHERE c."user_id" = u."id" AND c."type" = 'EXPENSE' AND lower(c."name") = 'empresa'
);
