# Trazer as questões e fazer a IA funcionar

Guia rápido para o ambiente **Windows (`D:\arena-estudos`) + Supabase**.
Todos os comandos abaixo são PowerShell, executados **na raiz do projeto**.

---

## Parte 1 — Trazer as 1.704 questões

### 1.1 Ordem correta (não pule)

```powershell
cd D:\arena\arena-estudos
npm install                  # só na 1ª vez
npm run db:generate          # ⚠️ gera o Prisma Client — obrigatório após atualizar o projeto
npm run db:migrate:deploy    # cria as tabelas no Supabase (NUNCA use db:migrate)
npm run db:seed              # papéis, permissões, provedores de IA, admin, conquistas, trilhas
npm run db:seed:questions    # ← importa as 1.704 questões
```

Atalho para os três do meio:

```powershell
npm run db:setup             # = db:generate + db:migrate:deploy + db:seed
```

Todos funcionam tanto na **raiz** (`D:\arena\arena-estudos`) quanto dentro de
`backend\`.

### 1.1.1 Se o seed quebrar com `TypeError: Cannot read properties of undefined`

```
❌ Erro no seed: TypeError: Cannot read properties of undefined (reading 'upsert')
    at seedAchievements (.../prisma/seed/index.js:161:30)
```

Significa que o **Prisma Client da sua máquina está desatualizado** (os modelos
de conquistas/trilhas não existem nele). Resolva com:

```powershell
cd D:\arena\arena-estudos
npx prisma generate
npm run db:migrate:deploy
npm run db:seed
```

(no Windows, se o `npx` reclamar: `node_modules\.bin\prisma generate`)

### 1.1.2 Se aparecer `Missing script: "db:seed:questions"`

Você rodou de dentro da pasta `backend\`. Duas opções:

```powershell
cd ..                        # volta para a raiz
npm run db:seed:questions
```

Ou atualize o projeto: o script agora também existe dentro de `backend\`.

> ⚠️ `db:migrate:deploy` (e **não** `db:migrate`): o `prisma migrate dev`
> precisa criar um *shadow database* e o Supabase não permite.

### 1.2 De onde o script lê as questões

Ele lê o `index.html` do app antigo (onde estavam `window.__BANCO__`,
`window.__EDITAL__` e `window.__TEORIA__`).

- **Caminho padrão:** `D:\backup-legado\index.html`
  (o script procura uma pasta `backup-legado` **ao lado** da pasta do projeto).
- **Se o seu HTML está em outro lugar**, aponte com `--file`:

```powershell
# exemplo: o clone original do repo
npm run db:seed:questions -- --file D:\estudo\index.html

# exemplo: dentro da própria pasta do projeto
npm run db:seed:questions -- --file D:\arena-estudos\backup-legado\index.html
```

### 1.3 Antes de gravar, confira sem gravar (opcional)

```powershell
npm run db:seed:questions -- --dry-run
```

Saída esperada:

```
📦 Importação do banco legado → PostgreSQL
   origem: ...\index.html
   modo: DRY-RUN (nada será gravado)

   encontradas 1704 questões no HTML legado
   [dry-run] 14 matérias seriam criadas
   [dry-run] 1704 questões seriam importadas
```

### 1.4 É idempotente — pode rodar quantas vezes quiser

A chave natural é o `externalId` da questão e a sigla da matéria, então
rodar de novo **não duplica**: ele atualiza o que mudou e ignora o que já está
igual.

```
✓ questões: 0 novas, 1704 atualizadas, 0 ignoradas
✅ Importação concluída. Total de questões no banco: 1704
```

### 1.5 Conferindo no banco

```powershell
npm run db:studio          # abre https://localhost:5555
# ou, pelo psql / SQL Editor do Supabase:
# SELECT count(*) FROM questions;      → 1704
# SELECT count(*) FROM subjects;       → 14
# SELECT count(*) FROM topics;         → 319
# SELECT count(*) FROM theory_items;   → 63
```

**Possíveis erros**

| Erro | Causa | Solução |
| --- | --- | --- |
| `P1001 can't reach database` | `DATABASE_URL` errada ou projeto Supabase pausado | confira a URL (senha com `@` precisa virar `%40`) e se o projeto está ativo |
| `TypeError ... reading 'upsert'` no seed | Prisma Client desatualizado | `npx prisma generate` (seção 1.1.1) |
| `Missing script: "db:seed:questions"` | rodou de dentro de `backend\` antes da atualização | rode da raiz ou atualize o projeto (seção 1.1.2) |
| `ENOENT ... index.html` | caminho do HTML | use `--file` com o caminho completo |
| `encontradas 0 questões` | HTML diferente do esperado | confirme que é o `index.html` original do app antigo |

---

## Parte 2 — Por que a IA não funciona

### 2.0 Diagnóstico automático (use antes de qualquer coisa)

```powershell
cd D:\arena\arena-estudos
npm run diagnose:ai -- --email SEU_EMAIL --senha SUA_SENHA
```

Ele roda **fora do navegador** e mostra, nesta ordem:
1. quais chaves de servidor existem no `.env` (mascaradas);
2. se a API responde e se o login funciona;
3. quais provedores têm chave e quais você tem salvos (com URL e modelo);
4. um **chat de verdade** em cada provedor utilizável, com o erro exato;
5. um veredito com o próximo passo.

Exemplo de saída quando nada está configurado:

```
⚠️  Nenhuma chave de servidor: cada usuário precisa cadastrar a sua na tela.
⚠️  NENHUMA utilizável — é por isso que o tutor pede chave.
❌ Nenhum provedor respondeu. Caminho mais curto:
   1. crie uma chave grátis em https://console.groq.com/keys
   2. no .env da raiz:  GROQ_API_KEY=gsk_...
```

### 2.0.1 "Minhas IAs estão travadas"

Se a tela fica com o spinner girando e nada acontece:

1. **Ctrl+Shift+R** (recarregar ignorando o cache) — depois de extrair uma
   atualização o navegador pode estar com o bundle antigo.
2. **Reinicie o backend** (o `.env` só é lido ao subir) e o Vite.
3. **Baixe o tempo de espera** no `.env`: `AI_REQUEST_TIMEOUT_MS=25000`.
4. Rode o `npm run diagnose:ai` acima: se ele responder, o problema é só o
   navegador; se ele falhar, o problema está na chave/provedor.
5. Abra o **Console do navegador (F12 → Network)** e veja se a chamada
   `/api/ai/chat` fica "pending" — aí é o provedor enrolando.

O frontend agora também **cancela sozinho** depois de 75 s e mostra
"A IA demorou demais para responder…" em vez de girar para sempre.

### 2.1 Diagnóstico (99% dos casos)

A IA **não tem chave de API**. O backend aceita 11 provedores, mas nenhum
funciona sem credencial. Sem chave, o chat responde:

```json
{
  "success": false,
  "error": {
    "message": "Configure uma chave de IA (Groq) em Configurações → Inteligência Artificial, ou peça ao administrador para habilitar a chave do servidor."
  }
}
```

Verifique rapidinho qual é o seu caso:

```powershell
# 1) faça login e guarde o token
$body = '{"email":"SEU_EMAIL","password":"SUA_SENHA"}'
$r = Invoke-RestMethod -Uri http://localhost:4000/api/auth/login -Method Post -Body $body -ContentType 'application/json'
$token = $r.data.tokens.accessToken

# 2) veja quais provedores têm chave
Invoke-RestMethod -Uri http://localhost:4000/api/ai/providers -Headers @{ Authorization = "Bearer $token" }
# hasServerKey: false em todos  →  nenhuma chave configurada no servidor
```

### 2.2 Solução A — chave do servidor (a mais simples para uso pessoal)

Edite o `.env` **na raiz do projeto** (`D:\arena-estudos\.env`):

```env
# Escolha UM provedor (Groq é o mais fácil: tem plano grátis e é rapidíssimo)
GROQ_API_KEY=gsk_sua_chave_aqui

AI_DEFAULT_PROVIDER=groq
AI_DEFAULT_MODEL=llama-3.3-70b-versatile
AI_MAX_TOKENS=1500
AI_TEMPERATURE=0.6
```

Depois **reinicie o backend** (obrigatório — o `.env` só é lido no boot):

```powershell
npm run dev
```

Onde pegar a chave (todas têm tier gratuito):

| Provedor | Onde criar | Variável |
| --- | --- | --- |
| **Groq** (recomendado) | https://console.groq.com/keys | `GROQ_API_KEY` |
| Google Gemini | https://aistudio.google.com/apikey | `GEMINI_API_KEY` |
| OpenRouter | https://openrouter.ai/keys | `OPENROUTER_API_KEY` |
| Mistral | https://console.mistral.ai/api-keys | `MISTRAL_API_KEY` |
| Hugging Face | https://huggingface.co/settings/tokens | `HF_TOKEN` |
| OpenAI / Anthropic / DeepSeek / xAI | painel de cada um | ver `.env.example` |
| **Ollama** (grátis, local, sem chave) | https://ollama.com/download | `OLLAMA_BASE_URL` |

### 2.3 Solução B — cada usuário cadastra a própria chave pela tela

1. Acesse **`/app/ia`** → botão **⚙ Configurar**.
2. Escolha o provedor, cole a chave e salve → **Testar**.
3. A chave é cifrada com **AES-256-GCM** antes de ir para o banco e **nunca**
   volta para o navegador (a API só devolve `hasKey: true/false`).

A chave do usuário tem prioridade sobre a do servidor.

### 2.4 Solução C — IA 100% grátis e offline (Ollama)

```powershell
# 1) instale e rode o modelo
ollama pull llama3.2
ollama serve                       # sobe em http://localhost:11434

# 2) no .env
AI_DEFAULT_PROVIDER=ollama
AI_DEFAULT_MODEL=llama3.2
OLLAMA_BASE_URL=http://localhost:11434/v1/chat/completions
```

> O Ollama já vem com `requiresKey: false`, então não precisa de chave.

### 2.5 Tabela de erros

| Mensagem / status | O que significa | O que fazer |
| --- | --- | --- |
| **400** "Configure uma chave de IA (...)" | nenhuma chave (nem do usuário, nem do servidor) | Solução A, B ou C |
| **502** "A IA respondeu com erro: Invalid API Key" | a chave foi lida mas o provedor recusou | confira se copiou a chave inteira e se ela está ativa |
| **502** "quota / rate limit" | limite do plano grátis | aguarde ou troque de provedor/modelo |
| **400** "Provedor de IA desconhecido" | nome errado em `AI_DEFAULT_PROVIDER` | use um dos 11: `openai, gemini, groq, huggingface, deepseek, mistral, anthropic, openrouter, xai, ollama, custom` |
| Tela pedindo chave mesmo com a do servidor configurada | **corrigido** — o tutor agora lista provedores com chave do servidor | atualize o frontend e recarregue |
| IA funciona mas não salva histórico | `saveHistory` | verifique `ai_conversations` no banco |

### 2.6 Correção feita nesta rodada

O tutor de IA só considerava "pronto" o provedor em que **o usuário** cadastrou
chave. Com apenas a chave do **servidor** configurada, a tela mostrava o aviso
"você precisa cadastrar a chave" mesmo dando certo no backend.
Agora a lista inclui provedores com chave do servidor, marcados como
**"· chave do servidor"** no seletor.

Arquivo: `frontend/src/pages/AiTutor.tsx`.

---

## Parte 3 — Checklist final

```powershell
cd D:\arena-estudos
npm run db:migrate:deploy     # ✅ tabelas
npm run db:seed               # ✅ papéis + admin
npm run db:seed:questions     # ✅ 1704 questões
npm run dev                   # ✅ API :4000 + web :5173
```

- http://localhost:5173 → login → **Painel** mostra o banco com 1.704 questões
- `/app/ia` → se o seletor de provedor aparecer, a IA está pronta
- Em caso de dúvida, o log do backend mostra a chamada e o erro do provedor
---

## Parte 4 — Questões geradas por IA: onde ficam e como evitar duplicatas

### Onde ficam

Toda questão gerada pela IA é gravada na tabela `questions` (a mesma do banco
oficial), com:

| campo | valor |
|---|---|
| `origin` | `AI` (as do legado são `GENERATED`/`CURATED`) |
| `status` | `PUBLISHED` — entra em uso na hora |
| `source` | `Gerada por IA` |
| `created_by_id` | quem gerou (só autoria; a questão é visível para todos) |
| `generated_batch_id` | lote da geração (provider, modelo, prompt, data) |

### Como identificar

- Na tela de treino/simulado, a questão mostra o selo **“gerada por IA 🤖”**.
- Filtro na tela **Treinar → Origem**:
  - _Todas as origens_
  - _Só do banco (sem IA)_ → `GET /api/questions?originNot=AI`
  - _Geradas por IA 🤖_ → `GET /api/questions?origin=AI`

### Consulta direta (Supabase → SQL Editor)

```sql
-- resumo por origem
select origin, status, count(*) from questions group by 1,2 order by 3 desc;

-- as geradas por IA, com matéria e modelo que gerou
select s.name as materia, left(q.prompt, 70) as enunciado, q.source,
       q."created_at", b.provider, b.model
from questions q
join subjects s on s.id = q.subject_id
left join ai_generated_batches b on b.id = q.generated_batch_id
where q.origin = 'AI'
order by q."created_at" desc limit 20;
```

### Filtro anti-duplicidade

Antes de gravar, o backend compara cada enunciado com o que já existe **na
mesma matéria** e com os outros do mesmo lote (`backend/src/modules/ai/question-dedupe.js`):

- normaliza o texto (sem acentos, sem pontuação, sem stopwords);
- calcula a similaridade por pares de palavras (coeficiente de Dice);
- **≥ 0,72** (ou **≥ 0,82** em enunciados curtos, onde o “comando” pesa muito)
  → a questão é descartada.

O resultado aparece na resposta:

```json
{ "created": 1, "skipped": 1, "duplicates": [{ "prompt": "…", "score": 0.91 }] }
```

- A tela avisa: _“1 questão gerada. 1 foi descartada por já existir no banco…”_.
- Se **todas** vierem repetidas, a API devolve **409**:
  _“A IA devolveu só questões que já existem no seu banco…”_.
- No simulado por IA o resumo vem em `generation`: `{created, skipped, duplicates}`.

### Observações

- Questões de IA continuam podendo cair nos simulados normais (o sorteio filtra
  apenas `status = 'PUBLISHED'`). Se quiser mudar isso, é uma linha em
  `simulados.service.js`.
- Elas são **globais** (todos os usuários veem). Só a autoria é individual.

---

## Parte 5 — “O provedor aposentou o meu modelo” (erro 502 na geração)

Sintoma real (Google, 2026):

```
A IA respondeu com erro: This model models/gemini-2.0-flash is no longer available.
Please update your code to use models/gemini-3.8-flash.
```

O provedor troca de modelos o tempo todo. Em vez de quebrar, o backend agora:

1. reconhece o erro de modelo descontinuado (`isModelGoneError`);
2. consulta a lista de modelos **ao vivo** do provedor (`GET .../models`);
3. escolhe o mais novo que serve para texto (`pickChatModel` — ignora
   TTS/imagem/embedding e prefere `flash`);
4. repete a chamada uma vez com o modelo novo;
5. **grava** o modelo que funcionou (`ai_providers.default_model` e, se a chave
   for do usuário, a preferência dele) para não repetir a descoberta.

Se nem assim der certo, a mensagem vem com o caminho:
_“O modelo configurado não existe mais neste provedor: abra Configurações →
Inteligência Artificial e escolha outro da lista.”_

### O que foi atualizado

| Arquivo | Mudança |
|---|---|
| `backend/src/modules/ai/providers/gemini.provider.js` | padrão `gemini-2.0-flash` → **`gemini-3.8-flash`** |
| `prisma/seed/index.js` | catálogo de provedores com o novo padrão |
| `backend/src/modules/ai/ai.service.js` | detecção + troca automática + gravação do modelo |

Nada de migration: é só código. Rode `npm run db:seed` se quiser atualizar o
catálogo no banco (a lista de modelos da tela é sempre consultada ao vivo).

### Erro 401 em rajada ao abrir o app

Era o access token vencido: as primeiras consultas tomavam 401, o cliente
renovava e repetia — funcionava, mas sujava o log. Agora o app **renova antes**:
lê o `exp` do JWT e, se venceu (ou vence em 30 s), chama `/auth/refresh` antes
de sair pedindo dados (`ensureFreshToken` em `frontend/src/services/http.ts`,
mais o boot em `auth.service.bootstrap`).

---

## Parte 6 — “A IA respondeu sem texto” (Hugging Face e afins)

Modelos de **raciocínio** (o padrão do Hugging Face hoje é
`openai/gpt-oss-120b`) devolvem o pensamento em `reasoning` /
`reasoning_content` e deixam o `content` vazio. O parser antigo só olhava
`content` — por isso o teste de credencial falhava com “A IA respondeu sem
texto”.

`extractOpenAiText` (em `backend/src/modules/ai/providers/base.js`) agora lê:

1. `choices[0].message.content` (string ou array de partes `[{type:'text'}]`);
2. `choices[0].text` e `choices[0].message.output_text` (formatos antigos);
3. `reasoning_content` / `reasoning` — último recurso;
4. `output_text`, `completion`, `response`, `generated_text` fora de `choices`.

Além disso, o teste de credencial passou de **10 para 300 tokens**: modelos que
“pensam” gastam o orçamento raciocinando e não sobrava nada para a resposta.

## Como conferir se a atualização está aplicada

```powershell
cd D:\arena\arena-estudos
node scripts/verificar-atualizacao.mjs
```

Ele diz, item por item, o que está OK, o que está desatualizado e avisa se a
extração criou uma pasta `arena-estudos` dentro da outra (o motivo mais comum
do backend continuar rodando o código antigo).

---

## Parte 7 — Rodízio automático entre provedores

Nenhum provedor aguenta sozinho: o Gemini entra em “high demand”, a Groq
descontinua modelo, o Hugging Face oscila. Agora, **quando um falha, o próximo
entra** — e assim por diante, até algum responder.

### Como funciona

1. A chamada começa pelo provedor pedido (o que você escolheu na tela ou o
   `AI_DEFAULT_PROVIDER`);
2. se ele falhar (sobrecarga, cota, chave inválida, timeout, modelo morto),
   o backend tenta o próximo **que tenha chave configurada**;
3. a ordem dos demais é: groq → gemini → huggingface → openrouter → mistral →
   deepseek → openai → anthropic → xai;
4. Ollama e “Outra IA (compatível com OpenAI)” só entram se você os escolher
   (dependem da sua máquina/URL);
5. a chamada inteira tem um **teto de tempo** (o `AI_REQUEST_TIMEOUT_MS`) — se
   o primeiro demorar, sobra menos para os próximos, e ninguém estoura o
   timeout do navegador.

### “Descanso” de quem acabou de falhar

Uma falha por sobrecarga levava ~15 s. Sem memória, cada nova pergunta pagaria
esses 15 s outra vez. Então o provedor que falha fica **60 s no fim da fila**:
as próximas chamadas vão direto para um saudável (e ele volta ao topo quando
alguma chamada sua der certo).

### O que a API devolve

```json
{
  "provider": "groq",
  "fallback": {
    "from": "gemini",
    "attempts": [{ "provider": "gemini", "error": "A IA respondeu com erro: This model is currently experiencing high demand..." }]
  }
}
```

- `fallback` só vem preenchido quando houve troca;
- o app avisa na tela: _“gemini falhou — as questões vieram de groq”_;
- em `/ai/generate-questions` também vêm `provider` e `fallback`;
- em `/ai/generate-simulado`, `generation.providers` lista quem gerou.

### Se todos falharem

HTTP 502 com a mensagem do último erro e um `details.attempts` dizendo o que
cada provedor respondeu — dá para colar no log e ver exatamente onde travou.

### Configuração (o que vale para a fila)

Um provedor entra na fila se tiver **chave do usuário** (salva pela tela de IA)
ou **chave do servidor** no `.env` do backend:

```
GROQ_API_KEY=...
GEMINI_API_KEY=...
HF_TOKEN=...
AI_DEFAULT_PROVIDER=gemini     # opcional: quem começa
```
