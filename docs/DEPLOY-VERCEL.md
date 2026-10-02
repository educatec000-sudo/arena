# Colocar o Arena Estudos no ar na Vercel

Guia passo a passo (pt-BR). Ao final você terá:

```
https://arena-estudos.vercel.app   ← frontend (Vite build, estático)
https://arena-estudos.vercel.app/api/*  ← API Express (1 função serverless)
                                              └──► Postgres do Supabase
```

Um **único projeto** na Vercel: o site e a API moram no mesmo domínio.
Por isso **não precisamos configurar CORS nem domínio de cookie** — o frontend
chama `/api` relativo, mesmo domínio, e o refresh token trafega num cookie
`httpOnly` com `SameSite=Strict` (funciona direito justamente por ser same-site).

O banco **continua sendo o Supabase** — a Vercel só hospeda o código.

---

## 0. O que já está pronto no código

| Arquivo | Para que serve |
|---|---|
| `api/index.js` | A "tomada" da API na Vercel. Não existe `app.listen`: o próprio Express já é uma função `(req, res)` e é isso que o runtime Node da Vercel entrega. Monta o app 1× por *cold start* e aquece o pool do Postgres. |
| `vercel.json` | Diz à Vercel como construir (`build:vercel`), onde está o site (`frontend/dist`), e faz os *rewrites*: `/api/*` → função, todo o resto → `index.html` (SPA). |
| `.vercelignore` | Mantém `.pgdata`, testes, `docs/` e `.env` fora do upload. |
| `prisma/schema.prisma` | `binaryTargets = ["native", "rhel-openssl-3.0.x"]` — o motor do Prisma que roda no Linux da Vercel. |
| `backend/src/middleware/rateLimiters.js` | `clientKey()`: se o serverless não trouxer `req.ip`, cai para `x-forwarded-for` e depois para um balde único, em vez de estourar `ERR_ERL_UNDEFINED_IP_ADDRESS`. |
| `AI_TOTAL_BUDGET_MS` | Teto de tempo para a cadeia de provedores de IA caber no limite da função. |

> **Por que não usamos `serverless-http`?** Ele traduz o formato de evento da
> **AWS**. Na Vercel isso só atrapalharia: o runtime Node já entrega `req/res`
> nativos.

---

## 1. Variáveis de ambiente (o passo mais importante)

No painel da Vercel: **Project → Settings → Environment Variables**.
Coloque cada uma para **Production**, **Preview** e **Development**.

### Obrigatórias

| Variável | Valor |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | URL do **Supabase** (veja 1.1) |
| `JWT_ACCESS_SECRET` | texto longo e aleatório, **mínimo 32 caracteres** |
| `JWT_REFRESH_SECRET` | outro texto longo e aleatório, **diferente** do anterior |
| `ENCRYPTION_KEY` | 64 caracteres hexadecimais (0-9, a-f) |

Como gerar os segredos (PowerShell):

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

> ⚠️ **Nunca reaproveite os segredos do `.env` de desenvolvimento.** Se um
> segredo vazar (ou você trocá-lo), todos os usuários são deslogados — e é
> exatamente isso que deve acontecer.

### 1.1. Qual URL do Supabase usar

No painel do Supabase: **Project Settings → Database → Connection string**.

Prefira a **Session pooler (porta 5432)**. Com ela uma única URL serve para a
API **e** para as migrações:

```
DATABASE_URL="postgresql://postgres.<ref>:<SENHA>@aws-0-<regiao>.pooler.supabase.com:5432/postgres?sslmode=require"
```

Se preferir o **Transaction pooler (porta 6543)** — que aguenta mais conexões
simultâneas vindas das funções serverless — acrescente `?pgbouncer=true` na URL
da API e use a conexão direta **apenas na hora de migrar** (passo 2), passando a
URL direta na linha de comando.

> **Por que não usamos `DIRECT_URL`?** O Prisma exige que uma variável citada no
> `schema.prisma` exista em **todo** comando — inclusive nos testes e no seu
> `.env` local. Declarar `directUrl` quebraria o projeto para quem não usa
> pooler. O override na linha de comando resolve o mesmo problema sem efeito
> colateral.

Se a senha tiver caractere especial, **codifique na URL**: `@` → `%40`,
`#` → `%23`, `!` → `%21`, `&` → `%26`.

### Recomendadas

| Variável | Valor |
|---|---|
| `APP_WEB_URL` | `https://SEU-PROJETO.vercel.app` (usado nos links de e-mail de recuperação) |
| `AI_DEFAULT_PROVIDER` | ex.: `groq` |
| `GROQ_API_KEY` | a sua chave da Groq |
| `GEMINI_API_KEY` | a sua chave do Google AI Studio |
| `HF_TOKEN` | o seu token da Hugging Face |
| `AI_TOTAL_BUDGET_MS` | `45000` |
| `AI_REQUEST_TIMEOUT_MS` | `40000` |

### Deixe em branco

| Variável | Motivo |
|---|---|
| `CORS_ORIGINS` | Front e API no mesmo domínio → não há CORS. Preencha só se for usar domínio separado. |
| `COOKIE_DOMAIN` | No domínio `*.vercel.app` não define cookie. Só use com domínio próprio. |
| `API_PREFIX` | O padrão já é `/api`. |
| `VITE_*` | **Não existe nenhuma.** O frontend fala com `/api` relativo. |

---

## 2. Criar as tabelas no Supabase (uma vez)

Rode do seu computador (ou do CI), **antes do primeiro deploy** — nunca deixe
isso para a função serverless:

```powershell
cd D:\arena\arena-estudos
npx prisma migrate deploy
npm run db:seed      # cria o usuário ADMIN (veja o e-mail/senha no .env)
```

Se o seu `DATABASE_URL` for o **pooler de transação (6543)**, rode a migração
com a conexão direta na linha de comando:

```powershell
$env:DATABASE_URL = "postgresql://postgres.<ref>:<SENHA>@db.<ref>.supabase.co:5432/postgres?sslmode=require"
npx prisma migrate deploy
```

> Use **`migrate deploy`**, nunca `migrate dev`: o Supabase não deixa o Prisma
> criar o *shadow database* que o `dev` exige.

---

## 3. Subir para a Vercel

### Opção A — pelo painel (mais fácil)

1. Acesse <https://vercel.com/new> e importe o repositório do GitHub.
2. **Root Directory**: `./` (deixe a raiz).
3. **Framework Preset**: `Other` — o `vercel.json` já comanda tudo.
4. **Build Command**: deixe vazio (o `vercel.json` usa `npm run build:vercel`).
5. **Output Directory**: deixe vazio (o `vercel.json` usa `frontend/dist`).
6. Cadastre as variáveis do passo 1 e clique em **Deploy**.

### Opção B — pela linha de comando

```bash
npm i -g vercel
vercel login
vercel link          # cria/vincula o projeto (deixe a raiz como está)
vercel --prod        # build + deploy de produção
```

Para conferir antes, `vercel dev` roda tudo localmente, inclusive a função.

---

## 4. Testando depois que subir

Cole no navegador (ou no PowerShell):

```text
https://SEU-PROJETO.vercel.app/api/health
```

Deve responder `200` com `{"status":"ok","database":"ok"}`.

```powershell
Invoke-WebRequest https://SEU-PROJETO.vercel.app/api/health | Select-Object -Expand Content
```

Depois:

1. Abra `https://SEU-PROJETO.vercel.app` → tela de login.
2. Entre com o usuário ADMIN criado pelo seed.
3. Faça uma questão e um simulado para confirmar que o banco responde.
4. Abra o **DevTools → Application → Service Workers**: o PWA deve instalar.
5. Chame o **tutor de IA** e veja qual provedor respondeu (o toast mostra).

Se algo der errado: **Vercel → Project → Deployments → Functions → View Logs**.

---

## 5. Limites que importam

| Limite | Valor | Consequência |
|---|---|---|
| Duração da função (plano **Hobby**) | **60 s** | É por isso que existe `AI_TOTAL_BUDGET_MS`. Com 45 s de orçamento, a cadeia tenta os provedores e ainda sobra tempo para responder. |
| Duração (Pro / Fluid) | 300 s | Pode subir o orçamento se quiser. |
| Conexões simultâneas do Postgres | Plano grátis do Supabase é apertado | Prefira o **pooler** no `DATABASE_URL`; a função abre conexão a cada *cold start*. |
| `vercel.json` → `maxDuration` | 60 | Aumente só se o plano permitir. |

**Dica:** o primeiro acesso depois de minutos parado é lento (cold start: sobe
o Express, gera o client do Prisma e abre conexão). É normal em serverless. Um
*uptime monitor* barato pingando `/api/health` de 5 em 5 minutos resolve.

---

## 6. Problemas conhecidos

| Sintoma | Causa e solução |
|---|---|
| `Prisma Client could not locate the Query Engine` | Faltou o `binaryTargets`. Já está no `schema.prisma`; se mexeu, rode `npx prisma generate` e faça o deploy de novo. |
| Tela branca, mas `/api/health` funciona | *Rewrite* do SPA. Confira se `outputDirectory` é `frontend/dist`. |
| `500` com `ERR_ERL_UNDEFINED_IP_ADDRESS` | Rate limiter sem IP. Já corrigido por `clientKey()`. |
| Login funciona mas a sessão não persiste | Cookie. Não defina `COOKIE_DOMAIN` no domínio `.vercel.app`. |
| `Can't reach database server` | `DATABASE_URL` errada, senha sem URL-encode, ou o Supabase pausou por inatividade. |
| `Migration engine error: no shadow database` | Alguém rodou `prisma migrate dev`. Use `migrate deploy`. |
| IA sempre estoura o tempo | Baixe `AI_REQUEST_TIMEOUT_MS` para ~30 s e `AI_TOTAL_BUDGET_MS` para ~40 s. |

---

## 7. Domínio próprio (opcional)

1. **Project → Settings → Domains** → adicione `seudominio.com.br`.
2. Ajuste `APP_WEB_URL` para o domínio novo.
3. A Vercel emite o HTTPS sozinha. **Não** precisa de `COOKIE_DOMAIN` — o
   cookie continua sendo do mesmo site (API e frontend no mesmo domínio).
