/**
 * Comprobaciones automáticas de ergonomía de voz por turno.
 * Se calculan en tiempo real para cada respuesta y alimentan la
 * "puntuación de calidad" del panel. Son heurísticas baratas y deterministas;
 * la evaluación con juez LLM vive en /evals.
 */
export interface TurnQuality {
  sentences: number;
  words: number;
  questions: number;
  hasMarkdown: boolean;
  longList: boolean;
  score: number; // 0-100
  flags: string[];
}

export function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?…])\s+(?=[¿¡A-ZÁÉÍÓÚÑ0-9])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 1);
}

export function assessTurn(text: string): TurnQuality {
  const flags: string[] = [];
  const sentences = splitSentences(text).length;
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const questions = (text.match(/\?/g) ?? []).length;
  const hasMarkdown = /(\*\*|__|^#{1,6}\s|^\s*[-*•]\s|`)/m.test(text);
  const longList = (text.match(/^\s*(\d+[.)]|[-*•])\s/gm) ?? []).length > 3;

  let score = 100;
  if (sentences > 3) {
    score -= Math.min(30, (sentences - 3) * 10);
    flags.push("more_than_3_sentences");
  }
  if (words > 60) {
    score -= Math.min(25, Math.ceil((words - 60) / 10) * 5);
    flags.push("long_turn");
  }
  if (questions > 1) {
    score -= 15;
    flags.push("multiple_questions");
  }
  if (hasMarkdown) {
    score -= 20;
    flags.push("markdown_in_voice");
  }
  if (longList) {
    score -= 15;
    flags.push("long_list");
  }
  if (!text.trim()) {
    score = 0;
    flags.push("empty");
  }
  return { sentences, words, questions, hasMarkdown, longList, score: Math.max(0, score), flags };
}

/** Limpia el texto para TTS por si el modelo cuela algún símbolo. */
export function toSpeakable(text: string): string {
  return text
    .replace(/[*_`#>]/g, "")
    .replace(/^\s*[-•]\s+/gm, "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/€/g, " euros")
    .replace(/\s+/g, " ")
    .trim();
}
