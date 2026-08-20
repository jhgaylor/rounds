/**
 * The Rounds protocol: how the app reads the agent.
 *
 * One block, `round`, emitted once per scheduled run. The thread is the
 * system of record — the app folds every round out of it, newest first — so
 * the history survives without the app storing anything. The agent's side of
 * the contract is `spec.ts`; change one, change both.
 */

export type ClusterStatus = "opened" | "already-open" | "declined" | "deferred" | "failed" | "clean";

export interface Cluster {
  key: string;
  file: string;
  status: ClusterStatus;
  checkIds: string[];
  title?: string;
  /** The pull request number, when there is one. */
  pr?: number;
  url?: string;
  /** Why it was deferred or failed. */
  note?: string;
}

export interface RoundSummary {
  total: number;
  quickWin: number;
  needsReview: number;
  reportOnly: number;
}

export interface Round {
  /** When the agent says it ran. */
  at?: string;
  commit?: string;
  branch?: string;
  scanned?: number;
  summary: RoundSummary;
  clusters: Cluster[];
  /** Rounds pull requests open at the end of the round. */
  openPrs: number;
  /** Set only when the round could not run at all. */
  error: string | null;
}

const FENCE = /```round[^\S\n]*\n([\s\S]*?)```/g;

/** Every well-formed round block in one reply. Malformed JSON is skipped. */
export function parseRounds(text: string): Round[] {
  const out: Round[] = [];
  for (const m of text.matchAll(FENCE)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(m[1]!);
    } catch {
      continue;
    }
    const round = asRound(parsed);
    if (round) out.push(round);
  }
  return out;
}

/** The reply with the block removed — the sentence a maintainer would read. */
export function stripBlocks(text: string): string {
  return text.replace(FENCE, "").replace(/\n{3,}/g, "\n\n").trim();
}

export interface RoundEntry {
  round: Round;
  /** The agent's prose for that round. */
  prose: string;
  /** When the turn ran, from Fountain — more trustworthy than the agent's own clock. */
  ranAt: string | null;
}

/** Fold a thread (oldest-first) into the rounds it recorded, newest first. */
export function foldRounds(turns: Array<{ reply: string; ranAt?: string | null }>): RoundEntry[] {
  const out: RoundEntry[] = [];
  for (const turn of turns) {
    const prose = stripBlocks(turn.reply);
    for (const round of parseRounds(turn.reply)) {
      out.push({ round, prose, ranAt: turn.ranAt ?? null });
    }
  }
  return out.reverse();
}

/** The pull requests this repo currently has open, from the newest round. */
export function openPullRequests(entries: RoundEntry[]): Cluster[] {
  const latest = entries[0];
  if (!latest) return [];
  const seen = new Set<number>();
  return latest.round.clusters.filter((c) => {
    if (c.status !== "opened" && c.status !== "already-open") return false;
    if (c.pr === undefined || seen.has(c.pr)) return false;
    seen.add(c.pr);
    return true;
  });
}

/** How a round reads in one line, for the repo list. */
export function describeRound(round: Round): string {
  if (round.error) return round.error;
  const opened = round.clusters.filter((c) => c.status === "opened").length;
  const failed = round.clusters.filter((c) => c.status === "failed").length;
  const parts: string[] = [];
  if (opened > 0) parts.push(`opened ${opened} pull request${opened === 1 ? "" : "s"}`);
  if (round.openPrs > 0 && opened !== round.openPrs) parts.push(`${round.openPrs} open`);
  if (failed > 0) parts.push(`${failed} failed`);
  if (parts.length === 0) parts.push(round.summary.total === 0 ? "clean — nothing to fix" : "nothing new to propose");
  return parts.join(" · ");
}

// ── shape guards ────────────────────────────────────────────────────────────

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

const STATUSES: ClusterStatus[] = ["opened", "already-open", "declined", "deferred", "failed", "clean"];

function asCluster(v: unknown): Cluster | null {
  if (!isObj(v)) return null;
  const key = str(v.key);
  const file = str(v.file);
  if (!key && !file) return null;
  const status = typeof v.status === "string" && (STATUSES as string[]).includes(v.status) ? (v.status as ClusterStatus) : "clean";
  const c: Cluster = {
    key: key ?? file!,
    file: file ?? key!,
    status,
    checkIds: Array.isArray(v.checkIds) ? v.checkIds.filter((x): x is string => typeof x === "string") : [],
  };
  const title = str(v.title);
  if (title) c.title = title;
  const pr = num(v.pr);
  if (pr !== undefined && pr > 0) c.pr = Math.floor(pr);
  const url = str(v.url);
  if (url && /^https?:\/\//.test(url)) c.url = url;
  const note = str(v.note);
  if (note) c.note = note;
  return c;
}

function asRound(v: unknown): Round | null {
  if (!isObj(v)) return null;
  const clusters = Array.isArray(v.clusters) ? v.clusters.map(asCluster).filter((c): c is Cluster => c !== null) : [];
  const s = isObj(v.summary) ? v.summary : {};
  const summary: RoundSummary = {
    total: num(s.total) ?? 0,
    quickWin: num(s.quickWin) ?? 0,
    needsReview: num(s.needsReview) ?? 0,
    reportOnly: num(s.reportOnly) ?? 0,
  };
  // A round with neither a summary nor clusters nor an error is not a round.
  const error = str(v.error);
  if (!isObj(v.summary) && clusters.length === 0 && !error) return null;
  const round: Round = {
    summary,
    clusters,
    openPrs: num(v.openPrs) ?? clusters.filter((c) => c.status === "opened" || c.status === "already-open").length,
    error,
  };
  const at = str(v.at);
  if (at) round.at = at;
  const commit = str(v.commit);
  if (commit) round.commit = commit;
  const branch = str(v.branch);
  if (branch) round.branch = branch;
  const scanned = num(v.scanned);
  if (scanned !== undefined) round.scanned = Math.floor(scanned);
  return round;
}
