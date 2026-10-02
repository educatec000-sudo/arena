#!/usr/bin/env node
/**
 * Diagnóstico da IA — roda FORA do navegador.
 *
 * Serve para responder "minha IA está travada, por quê?" sem adivinhar:
 *   1. quais chaves de servidor existem no .env (mascaradas);
 *   2. o que a API diz sobre provedores e credenciais do usuário;
 *   3. um chat mínimo de verdade, mostrando o erro exato do provedor.
 *
 * Uso:
 *   node scripts/diagnose-ai.mjs --email voce@exemplo.com --senha SuaSenha
 *   node scripts/diagnose-ai.mjs --email a@b.com --senha x --provider groq
 *   npm run diagnose:ai -- --email a@b.com --senha x
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '..');
dotenv.config({ path: path.join(ROOT, '.env'), quiet: true });

const args = process.argv.slice(2);
const getArg = (name, fallback = '') => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};

const BASE = getArg('base', process.env.API_BASE_URL || 'http://localhost:4000/api');
const email = getArg('email', process.env.DIAG_EMAIL || '');
const password = getArg('senha', getArg('password', ''));
const onlyProvider = getArg('provider', '');

const SERVER_KEYS = [
  ['openai', 'OPENAI_API_KEY'],
  ['gemini', 'GEMINI_API_KEY'],
  ['groq', 'GROQ_API_KEY'],
  ['huggingface', 'HF_TOKEN'],
  ['deepseek', 'DEEPSEEK_API_KEY'],
  ['mistral', 'MISTRAL_API_KEY'],
  ['anthropic', 'ANTHROPIC_API_KEY'],
  ['openrouter', 'OPENROUTER_API_KEY'],
  ['xai', 'XAI_API_KEY'],
];

const mask = (value) =>
  value ? `${value.slice(0, 6)}…${value.slice(-4)} (${value.length} caracteres)` : '—';

const line = (char = '-') => console.log(char.repeat(64));

async function call(pathname, { method = 'GET', token, body } = {}) {
  const started = Date.now();
  try {
    const res = await fetch(`${BASE}${pathname}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => null);
    return { status: res.status, json, ms: Date.now() - started };
  } catch (err) {
    return { status: 0, error: err.message, ms: Date.now() - started };
  }
}

console.log('\n🩺 Diagnóstico da IA — Arena Estudos');
line('=');

// ---------------------------------------------------------------- 1) .env ----
console.log('\n1) Chaves de SERVIDOR no .env (ninguém vê o valor completo):');
let anyKey = false;
for (const [key, envVar] of SERVER_KEYS) {
  const value = process.env[envVar] || '';
  if (value) anyKey = true;
  console.log(`   ${key.padEnd(12)} ${mask(value)}`);
}
console.log(`   ollama      ${process.env.OLLAMA_BASE_URL || 'http://localhost:11434/v1/chat/completions'}`);
console.log(
  `   provedor padrão: ${process.env.AI_DEFAULT_PROVIDER || '(vazio → groq)'} · modelo: ${
    process.env.AI_DEFAULT_MODEL || '(vazio)'
  }`,
);
if (!anyKey) {
  console.log('   ⚠️  Nenhuma chave de servidor: cada usuário precisa cadastrar a sua na tela.');
}

// ------------------------------------------------------------- 2) API viva ---
const health = await call('/health');
if (health.status === 0) {
  console.log(`\n❌ A API não responde em ${BASE} (${health.error}).`);
  console.log('   Suba o backend com:  npm run dev');
  process.exit(1);
}
console.log(`\n2) API responde: ${health.status} em ${health.ms} ms (${BASE})`);

// ---------------------------------------------------------------- 3) login ---
if (!email || !password) {
  console.log('\n⚠️  Passe --email e --senha para testar o chat de verdade.');
  console.log('   Ex.: node scripts/diagnose-ai.mjs --email voce@exemplo.com --senha SuaSenha');
  process.exit(0);
}

const login = await call('/auth/login', { method: 'POST', body: { email, password } });
if (login.status !== 200) {
  console.log(`\n❌ Login falhou (${login.status}): ${login.json?.error?.message ?? 'erro desconhecido'}`);
  process.exit(1);
}
const token = login.json.data.tokens.accessToken;
console.log(`3) Login OK: ${login.json.data.user.name} (${login.json.data.user.role?.name ?? '-'})`);

// --------------------------------------------------------- 4) provedores -----
const providers = await call('/ai/providers', { token });
console.log('\n4) Provedores segundo a API:');
for (const p of providers.json?.data ?? []) {
  const flag = p.hasServerKey ? '☁️ chave do servidor' : 'sem chave no servidor';
  console.log(`   ${p.key.padEnd(12)} ${p.name.padEnd(34)} ${flag}`);
}

const credentials = await call('/ai/credentials', { token });
const usable = (credentials.json?.data ?? []).filter((c) => c.isEnabled || c.hasServerKey);
console.log('\n   Suas credenciais salvas (as que aparecem para uso):');
if (!usable.length) {
  console.log('   ⚠️  NENHUMA utilizável — é por isso que o tutor pede chave.');
} else {
  for (const c of usable) {
    console.log(
      `   ${c.key.padEnd(12)} chave própria: ${c.hasKey ? 'sim' : 'não'} · modelo: ${
        c.model || '(vazio)'
      }${c.baseUrl ? ` · url: ${c.baseUrl}` : ''}`,
    );
  }
}

// ------------------------------------------------------------- 5) chat -------
const targets = onlyProvider ? [onlyProvider] : usable.map((c) => c.key);
if (!targets.length) {
  console.log('\n❌ Nada para testar: configure uma chave (servidor ou sua) e rode de novo.');
  console.log('   Rápido: coloque GROQ_API_KEY=gsk_... no .env e reinicie o backend.');
  process.exit(1);
}

console.log('\n5) Teste real de chat ("Responda apenas: OK"):');
let ok = false;
for (const key of targets) {
  const res = await call('/ai/chat', {
    method: 'POST',
    token,
    body: { messages: [{ role: 'user', content: 'Responda apenas: OK' }], provider: key, saveHistory: false },
  });

  if (res.status === 200) {
    const content = String(res.json?.data?.content ?? '').slice(0, 40).replace(/\n/g, ' ');
    console.log(`   ✅ ${key}: ${res.status} em ${res.ms} ms → "${content}"`);
    ok = true;
  } else {
    const message = res.json?.error?.message ?? res.error ?? 'sem detalhe';
    console.log(`   ❌ ${key}: ${res.status} em ${res.ms} ms → ${message}`);
  }
}

// ------------------------------------------------------------- veredito ------
line('=');
if (ok) {
  console.log('✅ Pelo menos um provedor funciona. Se a tela travar, é cache do navegador:');
  console.log('   Ctrl+Shift+R (ou Ctrl+F5) e, se ainda assim, reinicie o `npm run dev`.');
} else {
  console.log('❌ Nenhum provedor respondeu. Caminho mais curto:');
  console.log('   1. crie uma chave grátis em https://console.groq.com/keys');
  console.log('   2. no .env da raiz:  GROQ_API_KEY=gsk_...');
  console.log('      (e confira AI_DEFAULT_PROVIDER=groq / AI_DEFAULT_MODEL=llama-3.3-70b-versatile)');
  console.log('   3. reinicie o backend (o .env só é lido ao subir) e rode este diagnóstico de novo.');
  console.log('   Dica: se a resposta demorar muito, baixe AI_REQUEST_TIMEOUT_MS para 25000.');
}
console.log('');
process.exit(ok ? 0 : 1);
