import { LegalStatus, type LegalEvent } from "@/types/patent";
/** Conservative per-jurisdiction state machine. Never infer expiry from age. */
export function resolvePatentLegalStatus(
  events: LegalEvent[],
  jurisdiction?: string,
): LegalStatus {
  const scope = events.filter(
    (e) => !jurisdiction || e.jurisdiction === jurisdiction,
  );
  if (!scope.length || new Set(scope.map((e) => e.jurisdiction)).size !== 1)
    return LegalStatus.UNKNOWN;
  if (
    scope.some(
      (e) =>
        !/^\d{4}-\d{2}-\d{2}$/.test(e.date) ||
        Number.isNaN(Date.parse(e.date)) ||
        new Date(e.date).toISOString().slice(0, 10) !== e.date,
    )
  )
    return LegalStatus.UNKNOWN;
  const ordered = [...scope].sort((a, b) => a.date.localeCompare(b.date));
  let state = LegalStatus.UNKNOWN;
  for (let i = 0; i < ordered.length; i++) {
    const e = ordered[i];
    if (ordered[i + 1]?.date === e.date && ordered[i + 1].kind !== e.kind)
      return LegalStatus.UNKNOWN;
    if (e.kind === "UNMAPPED") {
      state = LegalStatus.UNKNOWN;
      continue;
    }
    if (e.kind === "FILED") {
      state = LegalStatus.UNKNOWN;
      continue;
    }
    if (e.kind === "GRANTED") {
      if (
        [
          LegalStatus.REVOKED,
          LegalStatus.EXPIRED,
          LegalStatus.WITHDRAWN,
          LegalStatus.ABANDONED,
          LegalStatus.LAPSED,
        ].includes(state)
      )
        return LegalStatus.UNKNOWN;
      state = LegalStatus.ACTIVE;
      continue;
    }
    if (e.kind === "RENEWED") {
      if (state !== LegalStatus.ACTIVE) state = LegalStatus.UNKNOWN;
      continue;
    }
    if (e.kind === "REINSTATED") {
      state =
        state === LegalStatus.LAPSED ? LegalStatus.ACTIVE : LegalStatus.UNKNOWN;
      continue;
    }
    state = LegalStatus[e.kind];
  }
  return state;
}
