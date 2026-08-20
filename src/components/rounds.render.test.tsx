import { describe, expect, test } from "bun:test";
import { renderToString } from "react-dom/server";
import { foldRounds } from "../lib/protocol";
import { RoundView } from "./RoundView";
import { TokenGate } from "./TokenGate";

const REPO = { host: "github.com", owner: "o", name: "r" } as const;

const block = (body: unknown, prose = "Did a round.") => `${prose}\n\n\`\`\`round\n${JSON.stringify(body)}\n\`\`\``;

const LATEST = block(
  {
    at: "2026-08-20T09:00:00Z",
    commit: "9f1c4a2b7e05",
    branch: "main",
    scanned: 19,
    summary: { total: 9, quickWin: 2, needsReview: 5, reportOnly: 2 },
    clusters: [
      { key: "k8s", file: "k8s/deployment.yaml", status: "opened", pr: 44, url: "https://github.com/o/r/pull/44", checkIds: ["WK8203"], title: "k8s: run as non-root" },
      { key: "ci", file: ".github/workflows/ci.yml", status: "declined", pr: 38, checkIds: ["GHA033"], note: "closed unmerged — not raising it again" },
      { key: "helm", file: "charts/web/templates/deployment.yaml", status: "failed", checkIds: ["WHM004"], note: "helm template failed after the edit" },
      { key: "docker", file: "Dockerfile", status: "already-open", pr: 39, url: "https://github.com/o/r/pull/39", checkIds: ["DKRD012"] },
    ],
    openPrs: 2,
    error: null,
  },
  "Opened one, left the rest.",
);

const EARLIER = block({ summary: { total: 11 }, clusters: [], openPrs: 0 }, "Quiet week.");

describe("RoundView", () => {
  const entries = foldRounds([{ reply: EARLIER, ranAt: "2026-08-13T09:00:00Z" }, { reply: LATEST, ranAt: "2026-08-20T09:00:00Z" }]);
  const html = renderToString(<RoundView entries={entries} repo={REPO} running={false} />);

  test("leads with the counts and the agent's own sentence", () => {
    expect(html).toContain("Opened one, left the rest.");
    expect(html).toContain("main@9f1c4a2");
    expect(html).toContain("19 files");
    expect(html).toContain("awaiting you");
  });

  test("shows every status, not just the pull requests it opened", () => {
    for (const label of ["opened", "declined", "failed", "already open"]) expect(html).toContain(label);
  });

  test("a declined cluster says it will not come back", () => {
    expect(html).toContain("closed unmerged — not raising it again");
    expect(html).toContain("you closed this one — it will never be raised again");
  });

  test("a failed cluster explains itself rather than being silent", () => {
    expect(html).toContain("helm template failed after the edit");
    expect(html).toContain("it could not verify or push the fix, so it opened nothing");
  });

  test("pull requests link out, rules link to their reference", () => {
    expect(html).toContain("https://github.com/o/r/pull/44");
    expect(html).toContain("https://intentius.io/chant/lint-rules/audit-rules/#wk8203");
    expect(html).toContain("https://github.com/o/r/blob/main/k8s/deployment.yaml");
  });

  test("earlier rounds are counted and folded away", () => {
    expect(html).toContain("Earlier rounds — 1");
    expect(html).not.toContain("Quiet week.");
  });

  test("a repo with no rounds yet says what happens next", () => {
    const empty = renderToString(<RoundView entries={[]} repo={REPO} running={false} />);
    expect(empty).toContain("No rounds yet");
    const first = renderToString(<RoundView entries={[]} repo={REPO} running />);
    expect(first).toContain("First round in progress");
  });

  test("a failed round shows the error instead of empty tiles", () => {
    const bad = foldRounds([{ reply: block({ error: "no push access to o/r", summary: {}, clusters: [] }) }]);
    const out = renderToString(<RoundView entries={bad} repo={REPO} running={false} />);
    expect(out).toContain("no push access to o/r");
    expect(out).not.toContain("awaiting you");
  });
});

describe("TokenGate", () => {
  test("confirms when the environment can push", () => {
    const html = renderToString(<TokenGate present saving={false} onSave={() => {}} />);
    expect(html).toContain("GITHUB_TOKEN");
    expect(html).toContain("can push and open pull requests");
  });

  test("warns when it cannot, and says what still works", () => {
    const html = renderToString(<TokenGate present={false} saving={false} onSave={() => {}} />);
    expect(html).toContain("still audit and report");
    expect(html).toContain("set it");
  });

  test("says nothing while the answer is unknown", () => {
    expect(renderToString(<TokenGate present={null} saving={false} onSave={() => {}} />)).toBe("");
  });
});
