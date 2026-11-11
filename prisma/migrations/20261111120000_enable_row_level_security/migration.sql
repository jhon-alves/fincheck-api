-- O app só acessa o banco pela API (Prisma), com o papel dono das tabelas, que ignora RLS.
-- Ligar RLS sem políticas fecha o acesso direto pela Data API do Supabase (papéis anon e authenticated).
-- Toda tabela nova criada em migrations futuras também precisa de ENABLE ROW LEVEL SECURITY.
ALTER TABLE "_prisma_migrations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "bank_accounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cards" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "categories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "recurring_rules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "transactions" ENABLE ROW LEVEL SECURITY;
