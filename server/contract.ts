/**
 * The contract between a round and this server — the few strings both halves
 * have to agree on exactly.
 *
 * It lives under `server/` because the server is now the half that enforces
 * it: the branch name and the marker are written here, from a signed grant,
 * rather than assembled by the agent and taken on trust. `src/lib/spec.ts`
 * imports these so the prompt and the enforcement cannot drift apart.
 *
 * Pure strings and regexes, no imports — the browser bundle pulls this in too.
 */

/** Every branch a round may write. Nothing outside this prefix is reachable. */
export const BRANCH_PREFIX = "rounds/";

/** Written into every pull request body, so a later round knows its own work. */
export const PR_MARKER = "rounds:cluster=";

/**
 * A cluster key: a file path lowercased with every run of non-alphanumeric
 * characters collapsed to a hyphen. `.github/workflows/ci.yml` →
 * `github-workflows-ci-yml`. Stable across rounds, which is the only reason
 * a round can recognise what it already proposed.
 */
export function clusterKey(path: string): string {
  return path.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export const CLUSTER_KEY = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const branchFor = (cluster: string) => `${BRANCH_PREFIX}${cluster}`;

/** `rounds/dockerfile` → `dockerfile`; null for a branch that is not ours. */
export function clusterOfBranch(branch: string): string | null {
  return branch.startsWith(BRANCH_PREFIX) ? branch.slice(BRANCH_PREFIX.length) : null;
}

export const markerFor = (cluster: string) => `<!-- ${PR_MARKER}${cluster} -->`;

/**
 * What a proposal may be. Generous enough for any configuration fix, small
 * enough that a runaway round cannot post a repository at us.
 */
export const LIMITS = {
  files: 20,
  bytes: 512 * 1024,
  pathLength: 255,
  clusterLength: 120,
  title: 120,
  body: 60_000,
} as const;
