import { describe, it, expect } from 'vitest';
import {
  cn,
  formatClock,
  formatDate,
  formatDateTime,
  formatMinutes,
  nf,
  pct,
  parseMarkdown,
  parseInline,
  DIFFICULTY_LABEL,
} from '@/utils/format';
import { tokenExpiresInMs } from '@/services/http';

describe('utils/format', () => {
  it('formata números no padrão brasileiro', () => {
    expect(nf(1234.5)).toBe('1.234,5');
    expect(nf(7.25, 2)).toBe('7,25');
    expect(pct(62.345)).toBe('62%');
  });

  it('formata o cronômetro e minutos de estudo', () => {
    expect(formatClock(0)).toBe('00:00');
    expect(formatClock(65)).toBe('01:05');
    expect(formatClock(3725)).toBe('1:02:05');
    expect(formatMinutes(90)).toBe('1h 30min');
    expect(formatMinutes(45)).toBe('45 min');
  });

  it('formata datas sem depender do fuso do navegador', () => {
    expect(formatDate('2026-12-13T00:00:00.000Z')).toMatch(/2026/);
    expect(formatDateTime('2026-12-13T10:30:00.000Z')).toContain('2026');
  });

  it('junta classes ignorando valores falsos', () => {
    expect(cn('btn', false && 'x', null, undefined, 'sm')).toBe('btn sm');
  });

  it('traduz os rótulos de dificuldade', () => {
    expect(DIFFICULTY_LABEL.FACIL).toBeTruthy();
    expect(DIFFICULTY_LABEL.DIFICIL).toBeTruthy();
  });
});

describe('parseMarkdown (usado nas respostas da IA)', () => {
  it('separa títulos, listas e parágrafos', () => {
    const blocks = parseMarkdown('## Título\n\nTexto simples.\n\n- item 1\n- item 2');
    expect(blocks.length).toBeGreaterThanOrEqual(3);
    expect(blocks.some((block) => block.type === 'heading')).toBe(true);
    expect(blocks.some((block) => block.type === 'list')).toBe(true);
    expect(blocks.some((block) => block.type === 'paragraph')).toBe(true);
  });

  it('marca negrito e código inline', () => {
    const parts = parseInline('use **const** e `await`');
    expect(parts.some((part) => part.bold)).toBe(true);
    expect(parts.some((part) => part.code)).toBe(true);
  });
});

describe('token JWT (http.ts)', () => {
  const makeToken = (expSeconds: number) => {
    const payload = btoa(JSON.stringify({ sub: 'x', exp: expSeconds })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return `cabecalho.${payload}.assinatura`;
  };

  it('devolve null quando não há token', () => {
    expect(tokenExpiresInMs(null)).toBeNull();
  });

  it('calcula quanto tempo ainda falta para expirar', () => {
    const futuro = Math.floor(Date.now() / 1000) + 600; // 10 min
    const restante = tokenExpiresInMs(makeToken(futuro));
    expect(restante).not.toBeNull();
    expect(restante!).toBeGreaterThan(590_000);
    expect(restante!).toBeLessThanOrEqual(600_000);
  });

  it('fica negativo quando o token já venceu', () => {
    const passado = Math.floor(Date.now() / 1000) - 60;
    expect(tokenExpiresInMs(makeToken(passado))).toBeLessThan(0);
  });

  it('não quebra com token inválido', () => {
    expect(tokenExpiresInMs('nao-e-um-jwt')).toBeNull();
  });
});
