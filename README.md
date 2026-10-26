# Controle de Cartões

Site pessoal para controlar despesas, receitas e cartões: painel com gráficos, lançamentos com parcelas, planilha com filtros e exportação, cartões de crédito/débito e backup.

- **Frontend:** HTML, CSS e JavaScript puro, sem build. A Vercel serve os arquivos como site estático.
- **Banco e login:** Supabase (Postgres + Auth). Cada usuário só enxerga os próprios dados (Row Level Security).

```
index.html            estrutura das páginas e tela de login
styles.css            visual (tema claro e escuro)
app.js                lógica do app e acesso ao Supabase
config.js             URL e chave pública do Supabase  ← você preenche
supabase/schema.sql   tabelas e regras de segurança     ← você roda no Supabase
manifest.webmanifest  permite "Adicionar à tela inicial" no celular
vercel.json           cabeçalhos de segurança
```

---

## 1. Criar o banco no Supabase

1. Crie um projeto em <https://supabase.com> (o plano gratuito atende).
2. Abra **SQL Editor → New query**, cole todo o conteúdo de `supabase/schema.sql` e clique em **Run**.
3. Em **Project Settings → API** (ou **API Keys**), copie:
   - a **Project URL** (`https://xxxx.supabase.co`)
   - a chave **anon** ou **publishable**
4. Cole os dois valores em `config.js`.

> A chave pública pode ficar no código do site, pois quem protege os dados são as regras do `schema.sql`. Nunca use a chave `service_role` / `secret`.

## 2. Configurar o login

Em **Authentication → URL Configuration**:

- **Site URL:** o endereço do site na Vercel (ex.: `https://controle-cartoes.vercel.app`)
- **Redirect URLs:** adicione o mesmo endereço e também `http://localhost:3000` se for testar localmente

Isso faz os links de confirmação de e-mail e de "esqueci minha senha" voltarem para o seu site.

## 3. Publicar na Vercel

1. Suba a pasta para um repositório no GitHub:
   ```bash
   git init
   git add .
   git commit -m "Controle de Cartões"
   git branch -M main
   git remote add origin https://github.com/SEU-USUARIO/controle-cartoes.git
   git push -u origin main
   ```
2. Na Vercel: **Add New → Project →** importe o repositório.
3. Em **Framework Preset**, escolha **Other**. Deixe o build e o output em branco.
4. Clique em **Deploy**. Cada novo `git push` publica de novo automaticamente.

## 4. Primeiro acesso

1. Abra o site e clique em **Criar conta**.
2. Confirme o e-mail pelo link recebido e entre.
3. **Recomendado:** depois de criar sua conta, desative novos cadastros em **Authentication → Sign In / Providers → Email → Allow new users to sign up**. Assim ninguém mais cria conta no seu site. Os dados já ficam isolados por usuário de qualquer forma.

No celular, use **Compartilhar → Adicionar à Tela de Início** (iPhone) ou **⋮ → Instalar app** (Android) para abrir como um aplicativo.

## Trazer dados da versão anterior

Na versão anterior do app, vá em **Ajustes → Baixar backup (JSON)**. Depois, neste site, use **Ajustes → Importar backup (JSON)**. Cartões e lançamentos são recriados. Os dados marcados como exemplo são ignorados.

## Testar localmente

Como o app usa módulos JavaScript, abra-o por um servidor, não pelo arquivo direto:

```bash
npx serve .        # ou: python3 -m http.server 3000
```

## Como as parcelas são calculadas

- Compras no **crédito** são divididas em parcelas mensais. Se o cartão tem dia de fechamento, compras feitas **a partir desse dia** entram na fatura do mês seguinte.
- Débito, Pix, dinheiro e boleto entram no mês da data informada.
- Os centavos que sobram na divisão ficam na primeira parcela.
