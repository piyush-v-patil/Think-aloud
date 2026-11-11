/**
 * The built-in problem bank: one JSON file per problem in /problems,
 * written for this project (no text from any other site).
 */
import type { Difficulty, Problem, Topic } from '../types';

const files = import.meta.glob<Problem>('/problems/*.json', { eager: true, import: 'default' });

export const BANK: Problem[] = Object.values(files).sort((a, b) => a.title.localeCompare(b.title));

export function bankProblem(id: string): Problem | undefined {
  return BANK.find((p) => p.id === id);
}

export function filterBank(difficulty: Difficulty | 'any', topic: Topic | 'any'): Problem[] {
  return BANK.filter(
    (p) => (difficulty === 'any' || p.difficulty === difficulty) && (topic === 'any' || p.topics.includes(topic)),
  );
}

export function pickRandom<T>(items: T[], exclude?: (item: T) => boolean): T | undefined {
  const pool = exclude ? items.filter((i) => !exclude(i)) : items;
  const from = pool.length ? pool : items;
  return from[Math.floor(Math.random() * from.length)];
}
