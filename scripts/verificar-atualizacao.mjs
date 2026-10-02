#!/usr/bin/env node
/**
 * Verifica se a atualização está realmente aplicada nesta pasta.
 *
 * Uso (PowerShell ou terminal), de dentro da raiz do projeto:
 *     node scripts/verificar-atualizacao.mjs
 *
 * Serve para o caso clássico: o zip foi extraído em outro lugar (ou criou uma
 * pasta dentro da outra) e o backend que está rodando continua sendo o antigo.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const checks = [
  {
    nome: 'Gemini com o modelo novo (gemini-3.8-flash)',
    arquivo: 'backend/src/modules/ai/providers/gemini.provider.js',
    contem: "defaultModel: 'gemini-3.8-flash'",
  },
  {
    nome: 'Troca automática de modelo descontinuado',
    arquivo: 'backend/src/modules/ai/ai.service.js',
    contem: 'isModelGoneError',
  },
  {
    nome: 'Escolha do modelo novo na lista do provedor',
    arquivo: 'backend/src/modules/ai/ai.service.js',
    contem: 'pickChatModel',
  },
  {
    nome: 'Leitura de respostas de modelos de raciocínio',
    arquivo: 'backend/src/modules/ai/providers/base.js',
    contem: 'extractOpenAiText',
  },
  {
    nome: 'Filtro anti-duplicidade das questões de IA',
    arquivo: 'backend/src/modules/ai/question-dedupe.js',
    contem: 'filterDuplicates',
  },
  {
    nome: 'Renovação do token antes de levar 401',
    arquivo: 'frontend/src/services/http.ts',
    contem: 'ensureFreshToken',
  },
  {
    nome: 'Rodízio entre provedores quando um falha',
    arquivo: 'backend/src/modules/ai/ai.service.js',
    contem: 'buildProviderChain',
  },
  {
    nome: 'Entrada serverless da API na Vercel (api/index.js)',
    arquivo: 'api/index.js',
    contem: 'export default async function handler',
  },
  {
    nome: 'Rewrites + build da Vercel (vercel.json)',
    arquivo: 'vercel.json',
    contem: 'outputDirectory',
  },
  {
    nome: 'Motor do Prisma para Linux (rhel-openssl-3.0.x)',
    arquivo: 'prisma/schema.prisma',
    contem: 'rhel-openssl-3.0.x',
  },
  {
    nome: 'Rate limiter sem quebrar quando falta o IP',
    arquivo: 'backend/src/middleware/rateLimiters.js',
    contem: 'clientKey',
  },
  {
    nome: 'Orcamento de tempo da cadeia de IA (AI_TOTAL_BUDGET_MS)',
    arquivo: 'backend/src/config/env.js',
    contem: 'totalBudgetMs',
  },
  {
    nome: 'Guia de deploy na Vercel',
    arquivo: 'docs/DEPLOY-VERCEL.md',
    contem: 'vercel --prod',
  },
  {
    nome: 'Cookie de sessão cross-site (COOKIE_SAMESITE)',
    arquivo: 'backend/src/shared/tokens.js',
    contem: 'sameSitePolicy',
  },
  {
    nome: 'CORS aceitando curinga (previews da Vercel)',
    arquivo: 'backend/src/config/security.js',
    contem: 'originAllowed',
  },
  {
    nome: 'Frontend apontando para API externa (VITE_API_URL)',
    arquivo: 'frontend/src/services/http.ts',
    contem: 'VITE_API_URL',
  },
  {
    nome: 'Config da Vercel para o frontend (frontend/vercel.json)',
    arquivo: 'frontend/vercel.json',
    contem: 'outputDirectory',
  },
  {
    nome: 'Blueprint do Render (render.yaml)',
    arquivo: 'render.yaml',
    contem: 'healthCheckPath',
  },
  {
    nome: 'Guia de deploy Render + Vercel',
    arquivo: 'docs/DEPLOY-RENDER-VERCEL.md',
    contem: 'onrender.com',
  },
  {
    nome: 'Filtro de origem na tela de treino',
    arquivo: 'frontend/src/components/question/QuestionFilters.tsx',
    contem: 'Geradas por IA',
  },
];

let ok = true;
console.log(`\nVerificando: ${root}\n`);

for (const check of checks) {
  const full = path.join(root, check.arquivo);
  let resultado = 'FALTANDO';
  let detalhe = '';

  if (!fs.existsSync(full)) {
    detalhe = 'arquivo não existe';
  } else {
    const conteudo = fs.readFileSync(full, 'utf8');
    if (conteudo.includes(check.contem)) {
      resultado = 'OK';
    } else {
      resultado = 'DESATUALIZADO';
      detalhe = `não achei "${check.contem}"`;
    }
  }

  if (resultado !== 'OK') ok = false;
  const marca = resultado === 'OK' ? '✓' : '✗';
  console.log(`  ${marca} ${resultado.padEnd(13)} ${check.nome}${detalhe ? `  (${detalhe})` : ''}`);
}

// Pasta duplicada: o zip tem a pasta "arena-estudos" na raiz. Extrair "aqui"
// dentro de D:\arena\arena-estudos cria D:\arena\arena-estudos\arena-estudos.
const nested = path.join(root, 'arena-estudos');
if (fs.existsSync(nested)) {
  ok = false;
  console.log(
    `\n  ! ATENÇÃO: existe uma pasta dentro da outra:\n      ${nested}\n` +
      '    O zip cria a pasta "arena-estudos". Extraia em D:\\arena (um nível acima),\n' +
      '    não dentro de D:\\arena\\arena-estudos.',
  );
}

console.log(
  ok
    ? '\nTudo certo: esta pasta está com a última versão. Reinicie o backend e o frontend.\n'
    : '\nEsta pasta NÃO está atualizada. Confira onde o zip foi extraído e repita a extração\n' +
        'sobre D:\\arena\\arena-estudos (com os servidores parados).\n',
);

process.exit(ok ? 0 : 1);
