/** The one clock every session event is stamped with: ms since the interview started. */
export class SessionClock {
  private start: number;
  constructor(start = performance.now()) {
    this.start = start;
  }
  now(): number {
    return Math.round(performance.now() - this.start);
  }
  /** Converts a performance.now() reading to session time. */
  at(perfNow: number): number {
    return Math.round(perfNow - this.start);
  }
}
