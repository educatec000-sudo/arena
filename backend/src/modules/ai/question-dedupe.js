/**
 * Checagem de questões repetidas.
 *
 * A IA não sabe o que já existe no banco, então é comum ela devolver uma
 * questão praticamente idêntica a outra já cadastrada (mudando duas ou três
 * palavras). Este módulo compara o texto normalizado das questões e devolve
 * as que são "quase iguais" a uma existente, para que o gerador não suje o
 * banco com duplicatas.
 *
 * É puro (não toca no banco): recebe textos, devolve textos. Assim dá para
 * testar sem subir nada.
 */

/** Palavras que não dizem nada sobre o conteúdo da questão. */
const STOPWORDS = new Set([
  'a','ao','aos','as','à','às','com','como','da','das','de','do','dos','e','em','entre','era','essa','esse','esta','este','eu','foi','fora','há','isso','já','lhe','mais','mas','me','mesmo','meu','muito','na','nas','no','nos','não','o','os','ou','para','pela','pelas','pelo','pelos','por','qual','quando','que','se','sem','ser','seu','seus','só','sua','suas','também','te','tem','um','uma','umas','uns','vez','ainda','sobre','sobre','dos','das','são','qual','todos','toda','todas','todo','qualquer','cada','pois','porque','porém','então','assim','devido','devido','segundo','conforme','através','após','antes','durante',
]);

/**
 * Deixa o texto comparável: minúsculas, sem acentos, sem pontuação,
 * sem stopwords e com espaços únicos.
 */
export function normalizeText(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Palavras relevantes (sem stopwords) de um texto. */
function keywords(text) {
  return normalizeText(text)
    .split(' ')
    // Palavras de conteúdo (3+ letras). Números entram sempre: "Art. 5º" e
    // "Art. 6º" são questões diferentes e não podem virar a mesma.
    .filter((word) => (word.length > 2 || /\d/.test(word)) && !STOPWORDS.has(word));
}

/** Pares de palavras vizinhas — é o que pega a "ordem" da frase. */
function bigrams(words) {
  const grams = new Set();
  for (let i = 0; i < words.length - 1; i += 1) grams.add(`${words[i]} ${words[i + 1]}`);
  return grams;
}

/**
 * Similaridade de 0 a 1 entre dois textos (coeficiente de Dice sobre os
 * pares de palavras). 1 = praticamente o mesmo texto.
 */
export function similarity(a, b) {
  const gramsA = bigrams(keywords(a));
  const gramsB = bigrams(keywords(b));
  if (!gramsA.size || !gramsB.size) return 0;

  let shared = 0;
  for (const gram of gramsA) if (gramsB.has(gram)) shared += 1;
  return (2 * shared) / (gramsA.size + gramsB.size);
}

/** Acima deste valor consideramos que é a mesma questão. */
export const DUPLICATE_THRESHOLD = 0.72;

/**
 * Questões curtas (menos de 12 palavras de conteúdo) exigem quase-identidade.
 *
 * Motivo: o "comando" (assinale a alternativa correta, segundo a CF/88...) pesa
 * muito num enunciado de duas linhas e faria duas questões diferentes parecerem
 * a mesma. Em texto curto só descartamos se for praticamente idêntico.
 */
export function thresholdFor(keywordCount, base = DUPLICATE_THRESHOLD) {
  return keywordCount < 12 ? Math.min(0.95, base + 0.1) : base;
}

/**
 * Separa o que é novo do que é repetido.
 *
 * @param {string[]} incoming  enunciados que a IA acabou de gerar
 * @param {string[]} existing  enunciados que já existem no banco
 * @param {number} threshold   limiar de similaridade (0 a 1)
 * @returns {{ unique: string[], duplicates: Array<{ prompt: string, matched: string, score: number }> }}
 *
 * Observação: a comparação é feita também entre os próprios itens gerados,
 * porque a IA costuma repetir questões dentro da mesma resposta.
 */
export function filterDuplicates(incoming, existing = [], threshold = DUPLICATE_THRESHOLD) {
  const pool = existing.map((text) => {
    const words = keywords(text);
    return { text, words, grams: bigrams(words) };
  });
  const unique = [];
  const duplicates = [];

  for (const prompt of incoming) {
    const words = keywords(prompt);
    const grams = bigrams(words);
    const limit = thresholdFor(words.length, threshold);

    let best = { score: 0, matched: null };
    for (const item of pool) {
      let shared = 0;
      for (const gram of grams) if (item.grams.has(gram)) shared += 1;
      const score = (2 * shared) / (grams.size + item.grams.size || 1);
      if (score > best.score) best = { score, matched: item.text };
    }

    if (best.score >= limit) {
      duplicates.push({ prompt, matched: best.matched, score: Number(best.score.toFixed(3)) });
    } else {
      unique.push(prompt);
      // entra no pool para pegar repetições dentro do próprio lote
      pool.push({ text: prompt, norm: words, grams });
    }
  }

  return { unique, duplicates };
}
