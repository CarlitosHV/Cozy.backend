import { LevelRecordDocument } from '../../models/types.js';

/** Higher score first; equal scores go to the faster time. */
export function compareRecords(a: LevelRecordDocument, b: LevelRecordDocument): number {
  const byScore = (b.score ?? 0) - (a.score ?? 0);
  if (byScore !== 0) return byScore;
  return a.timeSeconds - b.timeSeconds;
}

/** Each player's best run only, sorted for the ranking. */
export function bestPerPlayer(records: LevelRecordDocument[]): LevelRecordDocument[] {
  const best = new Map<string, LevelRecordDocument>();
  for (const r of records) {
    const prev = best.get(r.userId);
    if (!prev || compareRecords(r, prev) < 0) best.set(r.userId, r);
  }
  return [...best.values()].sort(compareRecords);
}
