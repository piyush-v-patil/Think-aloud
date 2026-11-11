/**
 * The built-in problem bank: one JSON file per problem in /problems,
 * written for this project (no text from any other site).
 *
 * Only the fields the setup screen needs are bundled up front; each full
 * problem (with its analysis) loads when an interview starts.
 */
import index from 'virtual:problem-index';
import type { Difficulty, Problem, Topic } from '../types';

export interface BankEntry {
  id: string;
  title: string;
  difficulty: Difficulty;
  topics: Topic[];
}


const loaders = import.meta.glob<Problem>('/problems/*.json', { import: 'default' });

export const BANK: BankEntry[] = [...(index as BankEntry[])].sort((a, b) => a.title.localeCompare(b.title));

export async function loadBankProblem(id: string): Promise<Problem | undefined> {
  const load = loaders[`/problems/${id}.json`];
  return load ? load() : undefined;
}

export function filterBank(difficulty: Difficulty | 'any', topic: Topic | 'any'): BankEntry[] {
  return BANK.filter(
    (p) => (difficulty === 'any' || p.difficulty === difficulty) && (topic === 'any' || p.topics.includes(topic)),
  );
}

export function pickRandom<T>(items: T[], exclude?: (item: T) => boolean): T | undefined {
  const pool = exclude ? items.filter((i) => !exclude(i)) : items;
  const from = pool.length ? pool : items;
  return from[Math.floor(Math.random() * from.length)];
}
