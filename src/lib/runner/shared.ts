import { CodeRunner } from './runner';

/**
 * One code runner for the whole page, so a runtime loaded on the setup
 * screen is already running when the interview starts, and stays warm for
 * the next one. Its time limits stop runaway code, so it is never disposed.
 */
export const sharedRunner = new CodeRunner();
