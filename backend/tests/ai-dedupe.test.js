import { describe, it, expect } from 'vitest';
import {
  normalizeText,
  similarity,
  filterDuplicates,
  DUPLICATE_THRESHOLD,
} from '../src/modules/ai/question-dedupe.js';

/**
 * Testes do filtro anti-duplicidade.
 * São puros (não usam banco nem rede): comparam texto com texto.
 */
describe('checagem de questões duplicadas', () => {
  it('normaliza o texto tirando acentos, pontuação e stopwords', () => {
    expect(normalizeText('  Assinale A alternativa: correta!  ')).toBe('assinale a alternativa correta');
  });

  it('considera idênticas duas questões com o mesmo texto', () => {
    const a = 'Segundo a CF/88, assinale a alternativa correta sobre controle externo.';
    expect(similarity(a, a)).toBe(1);
  });

  it('detecta a "quase idêntica" (mudam duas ou três palavras)', () => {
    const a = 'Questão 1: segundo a CF/88, assinale a alternativa correta sobre o tema 1.';
    const b = 'Questão 1: segundo a CF/88, assinale a alternativa correta sobre o tema 7.';
    expect(similarity(a, b)).toBeGreaterThanOrEqual(DUPLICATE_THRESHOLD);
  });

  it('NÃO confunde questões diferentes que só compartilham o vocabulário', () => {
    const a = 'Assinale a alternativa em que a crase é obrigatória.';
    const b = 'Assinale a alternativa em que a crase é facultativa.';
    expect(similarity(a, b)).toBeLessThan(DUPLICATE_THRESHOLD);
  });

  it('não trata artigo diferente como a mesma questão', () => {
    const a = 'Segundo o Art. 5º da CF/88, assinale a alternativa sobre direitos fundamentais.';
    const b = 'Segundo o Art. 6º da CF/88, assinale a alternativa sobre direitos sociais.';
    expect(similarity(a, b)).toBeLessThan(DUPLICATE_THRESHOLD);
  });

  it('separa as novas das repetidas (contra o banco e dentro do lote)', () => {
    const existing = [
      'Segundo a CF/88, assinale a alternativa correta sobre controle externo.',
      'Sobre a crase, assinale a alternativa correta conforme a norma culta.',
    ];
    const incoming = [
      'Segundo a CF/88, assinale a alternativa correta sobre controle externo, conforme a lei.', // repetida
      'O pregão eletrônico exige fase recursal única? Assinale a alternativa correta.', // nova
      'O pregão eletrônico exige fase recursal única? Assinale a alternativa correta.', // repetida no lote
    ];

    const { unique, duplicates } = filterDuplicates(incoming, existing);

    expect(unique).toHaveLength(1);
    expect(duplicates).toHaveLength(2);
    expect(duplicates[0].score).toBeGreaterThanOrEqual(DUPLICATE_THRESHOLD);
  });

  it('exige quase-identidade em enunciados curtos (comando repetido)', () => {
    // Mesma estrutura, conteúdo diferente: não pode ser tratado como repetida.
    const a = 'Assinale a alternativa correta sobre improbidade administrativa.';
    const b = 'Assinale a alternativa correta sobre poder de polícia.';
    expect(similarity(a, b)).toBeGreaterThan(0.3);
    expect(filterDuplicates([b], [a]).unique).toHaveLength(1);
  });

  it('descarta a quase-idêntica mesmo sendo curta', () => {
    const a = 'Sobre licitação, assinale a alternativa correta conforme a Lei 14.133.';
    const b = 'Sobre licitação, assinale a alternativa correta conforme a Lei 14.133 de 2021.';
    expect(filterDuplicates([b], [a]).duplicates).toHaveLength(1);
  });

  it('não descarta nada quando o banco está vazio', () => {
    const { unique, duplicates } = filterDuplicates(['Enunciado 1 sobre licitação?', 'Enunciado 2 sobre crase?'], []);
    expect(unique).toHaveLength(2);
    expect(duplicates).toHaveLength(0);
  });
});
