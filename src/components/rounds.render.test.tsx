import { describe, expect, test } from "bun:test";
import { renderToString } from "react-dom/server";
import { foldRounds } from "../lib/protocol";
import { RoundView } from "./RoundView";
import { InstallGate } from "./InstallGate";

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
    expect(html).toContain("it could not verify the fix, or the server refused it");
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

describe("InstallGate", () => {
  const APP = { configured: true, slug: "rounds-bot", clientId: "Iv1.abc", installUrl: "https://github.com/apps/rounds-bot/installations/new" };
  const AUTH = { token: "gho_x", login: "octocat" };
  const render = (over: Record<string, unknown> = {}) =>
    renderToString(
      <InstallGate
        appInfo={APP}
        auth={null}
        installed={null}
        checking={false}
        onSignIn={() => {}}
        onSignOut={() => {}}
        onRecheck={() => {}}
        {...over}
      />,
    );

  test("nobody signed in: offers the sign-in, and never a token to paste", () => {
    const html = render();
    expect(html).toContain("Sign in with GitHub");
    expect(html).not.toContain("github_pat");
  });

  test("signed in but the App is nowhere: sends them to install it", () => {
    const html = render({ auth: AUTH, installed: false });
    expect(html).toContain("is not installed anywhere yet");
    expect(html).toContain("https://github.com/apps/rounds-bot/installations/new");
    expect(html).toContain("I&#x27;ve installed it");
  });

  test("ready: says what the agent can and cannot do", () => {
    const html = render({ auth: AUTH, installed: true });
    expect(html).toContain("octocat");
    expect(html).toContain("cannot write anywhere");
  });

  test("no App on this deployment: says so, because there is no fallback left", () => {
    const html = render({ appInfo: { configured: false, slug: null, clientId: null, installUrl: null } });
    expect(html).toContain("no GitHub App configured");
    expect(html).toContain("GRANT_SECRET");
  });
});
