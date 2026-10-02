import { describe, it, expect, beforeEach } from 'vitest';
import { storage, pendingAnswers, type PendingAnswer } from '@/utils/storage';

/**
 * O localStorage é só CACHE: a fonte da verdade é o Postgres.
 * Estes testes garantem que o cache nunca derruba o app quando está
 * indisponível ou corrompido.
 */
describe('utils/storage (cache local)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('grava e lê valores com o prefixo do app', () => {
    storage.set('banco', { total: 1704 });
    expect(storage.get('banco')).toEqual({ total: 1704 });
    expect(localStorage.getItem('arena:v1:banco')).toBeTruthy();
  });

  it('devolve o fallback quando a chave não existe', () => {
    expect(storage.get('nao-existe', 42)).toBe(42);
  });

  it('não quebra com JSON corrompido', () => {
    localStorage.setItem('arena:v1:quebrado', '{isso nao e json');
    expect(storage.get('quebrado', 'ok')).toBe('ok');
  });

  it('remove apenas as chaves do app', () => {
    storage.set('minha-chave', 1);
    localStorage.setItem('outra-lib', 'intocada');
    storage.clearAll();
    expect(storage.get('minha-chave')).toBeNull();
    expect(localStorage.getItem('outra-lib')).toBe('intocada');
  });
});

describe('fila de respostas offline', () => {
  beforeEach(() => localStorage.clear());

  const answer: PendingAnswer = {
    questionId: 'q1',
    chosenLabel: 'A',
    timeSpentSeconds: 20,
    createdAt: Date.now(),
  };

  it('começa vazia (a ausência de fila nunca derruba o app)', () => {
    expect(Array.isArray(pendingAnswers.all())).toBe(true);
    expect(pendingAnswers.all()).toEqual([]);
  });

  it('guarda o que foi respondido sem internet', () => {
    pendingAnswers.add(answer);
    expect(pendingAnswers.all()).toHaveLength(1);
    expect(pendingAnswers.all()[0]).toMatchObject({ questionId: 'q1', chosenLabel: 'A' });
  });

  it('é esvaziada depois de sincronizar', () => {
    pendingAnswers.add(answer);
    pendingAnswers.clear();
    expect(pendingAnswers.all()).toEqual([]);
  });
});
