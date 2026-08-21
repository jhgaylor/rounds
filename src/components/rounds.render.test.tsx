import { describe, expect, test } from "bun:test";
import { renderToString } from "react-dom/server";
import { foldRounds } from "../lib/protocol";
import { RoundView } from "./RoundView";
import { InstallGate } from "./InstallGate";
import { FAMILIES, Landing, TIERS, TOTAL } from "./Landing";
import { RepoPicker } from "./RepoPicker";
import { keyOfSlug, type AccessibleRepo } from "../lib/repos";

const REPO = { host: "github.com", owner: "o", name: "r" } as const;

const block = (body: unknown, prose = "Did a round.", diffs: Record<string, string> = {}) => {
  const fences = Object.entries(diffs)
    .map(([cluster, diff]) => `\n\n\`\`\`round-diff ${cluster}\n${diff}\n\`\`\``)
    .join("");
  return `${prose}\n\n\`\`\`round\n${JSON.stringify(body)}\n\`\`\`${fences}`;
};

const K8S_DIFF = `diff --git a/k8s/deployment.yaml b/k8s/deployment.yaml
--- a/k8s/deployment.yaml
+++ b/k8s/deployment.yaml
@@ -14,6 +14,8 @@ spec:
         - name: web
+          securityContext:
+            runAsNonRoot: true
           ports:`;

const HELM_DIFF = `diff --git a/charts/web/templates/deployment.yaml b/charts/web/templates/deployment.yaml
--- a/charts/web/templates/deployment.yaml
+++ b/charts/web/templates/deployment.yaml
@@ -22,7 +22,7 @@ spec:
-              value: {{ .Values.apiKey }}
+              valueFrom:`;

const LATEST = block(
  {
    at: "2026-08-20T09:00:00Z",
    commit: "9f1c4a2b7e05",
    branch: "main",
    scanned: 19,
    summary: { total: 9, quickWin: 2, needsReview: 5, reportOnly: 2 },
    findings: [
      {
        checkId: "WK8203",
        severity: "error",
        message: "No securityContext; the container runs as uid 0.",
        file: "k8s/deployment.yaml",
        entity: "Deployment/web",
        tier: "merge-worthy",
        fixKind: "guidance",
        category: "security",
        title: "Container runs as root",
        remediation: "Set runAsNonRoot and a non-zero runAsUser.",
        note: "Added a securityContext running the container as uid 10001.",
      },
      {
        checkId: "GHA033",
        severity: "error",
        message: "No permissions block.",
        file: ".github/workflows/ci.yml",
        tier: "merge-worthy",
        fixKind: "deterministic",
        category: "security",
        title: "Workflow permissions are not restricted",
      },
      {
        checkId: "WHM004",
        severity: "warning",
        message: "The chart inlines a Secret.",
        file: "charts/web/templates/deployment.yaml",
        tier: "merge-worthy",
        fixKind: "guidance",
        category: "security",
        title: "Secret inlined into a template",
      },
      {
        checkId: "DKRD012",
        severity: "warning",
        message: "Base image is a mutable tag.",
        file: "Dockerfile",
        tier: "merge-worthy",
        fixKind: "deterministic",
        category: "correctness",
        title: "Base image is not pinned to a digest",
      },
      {
        checkId: "GHA104",
        severity: "info",
        message: "No timeout-minutes on the build job.",
        file: ".github/workflows/ci.yml",
        tier: "report-only",
        fixKind: "guidance",
        category: "best-practice",
        title: "Job has no timeout",
      },
    ],
    omitted: 3,
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
  { k8s: K8S_DIFF, helm: HELM_DIFF },
);

const EARLIER = block({ summary: { total: 11 }, clusters: [], openPrs: 0 }, "Quiet week.");

describe("RoundView", () => {
  const entries = foldRounds([{ reply: EARLIER, ranAt: "2026-08-13T09:00:00Z" }, { reply: LATEST, ranAt: "2026-08-20T09:00:00Z" }]);
  const html = renderToString(<RoundView entries={entries} repo={REPO} running={false} />);
  /** The same html without React's text-boundary comments or tags, for reading sentences out of it. */
  const stripped = html.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, "");

  test("leads with the counts, and with what it looked at", () => {
    expect(html).toContain("main@9f1c4a2");
    expect(html).toContain("19 files");
    expect(html).toContain("awaiting you");
  });

  // Whatever the round wrote about itself is not the report. The counts come
  // from the record, so they cannot flatter it or contradict the rows below.
  test("never renders the reply's prose", () => {
    expect(html).not.toContain("Opened one, left the rest.");
    expect(html).not.toContain("Quiet week.");
  });

  test("counts the failure, and stays quiet about the statuses that did not happen", () => {
    expect(stripped).toContain("1failed");
    // Nothing was held back this round. A tile reading "0 held back" every
    // week is how somebody learns to stop reading the tiles.
    expect(stripped).not.toContain("held back");
  });

  test("shows every status, not just the pull requests it opened", () => {
    for (const label of ["opened", "declined", "failed", "already open"]) expect(html).toContain(label);
  });

  test("a declined cluster says it will not come back, and how to take that back", () => {
    expect(html).toContain("closed unmerged — not raising it again");
    expect(html).toContain("you closed this one — it stays closed unless you label that pull request rounds:reconsider");
    expect(stripped).toContain("Label #38 rounds:reconsider on GitHub to have it proposed again.");
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

  test("the findings are on the page, not only their rule ids", () => {
    expect(html).toContain("Container runs as root");
    expect(html).toContain("Deployment/web");
  });

  test("what the agent changed wins over what chant advises, when it changed something", () => {
    expect(html).toContain("Added a securityContext running the container as uid 10001.");
    expect(html).not.toContain("Set runAsNonRoot and a non-zero runAsUser.");
  });

  test("a judgment call is marked as one — it is the half that needs reading", () => {
    expect(html).toContain("judgment call");
  });

  test("the report-only tier is present but folded away", () => {
    expect(html).toContain("Noted, not proposed — 1");
    expect(html).not.toContain("Job has no timeout");
  });

  test("findings the round left out are still accounted for", () => {
    expect(html).toContain("3 further findings not listed");
  });

  test("a cluster that changed a file offers its diff", () => {
    // Both the opened one and the failed one: the failed cluster's diff never
    // reached GitHub, so this is the only place it can be seen at all.
    expect(html.match(/See the change/g)).toHaveLength(2);
    expect(html).toContain("+2");
  });

  test("a cluster the round did nothing for offers no diff to see", () => {
    const quiet = foldRounds([
      { reply: block({ summary: { total: 1 }, findings: [], clusters: [{ key: "a", file: "a.yml", status: "clean", checkIds: [] }], openPrs: 0 }) },
    ]);
    expect(renderToString(<RoundView entries={quiet} repo={REPO} running={false} />)).not.toContain("See the change");
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

  test("ready: says what an enrolled repository can and cannot do", () => {
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

// The landing page makes numeric claims about what chant catches. They come
// from chant's audit rules reference, and the failure mode is that they rot
// quietly — so the arithmetic is pinned rather than trusted.
describe("Landing", () => {
  const html = renderToString(<Landing error={null} onPaste={() => {}} />);

  test("the tiers account for every rule, with none double-counted", () => {
    expect(TIERS.mechanical + TIERS.judgment + TIERS.hygiene).toBe(TOTAL);
    expect(TOTAL).toBe(244);
  });

  test("the headline number is the sum of the families, not a number someone typed", () => {
    expect(FAMILIES.reduce((n, f) => n + f.rules, 0)).toBe(TOTAL);
    expect(html).toContain(`>${TOTAL}<`);
  });

  test("every format it audits is named, with where it looks", () => {
    for (const f of FAMILIES) {
      expect(html).toContain(f.name);
      expect(html).toContain(f.where.replace(/&/g, "&amp;"));
    }
  });

  test("it is honest that most findings are not auto-opened", () => {
    // The mechanical tier is small; claiming otherwise would be the easiest
    // and worst lie on this page.
    expect(TIERS.mechanical).toBeLessThan(TIERS.judgment);
    expect(html).toContain("on by default");
    expect(html).toContain("one checkbox away");
    expect(html).toContain("never");
  });

  test("it leads with the pitch and ends with the sign-in, not the other way round", () => {
    expect(html.indexOf("Nothing watches your configuration")).toBeLessThan(html.indexOf("Sign in with Fountain"));
  });

  test("it says what reads your code cannot write, which is the whole trust argument", () => {
    expect(html).toContain("Nothing that reads your repository can write to it");
    expect(html).toContain("can only read");
  });

  // It is a page for buying an outcome, not a tour of the machinery. Naming
  // the parts is what the README is for.
  test("it never says `agent`", () => {
    expect(html.toLowerCase()).not.toContain("agent");
  });

  test("the sign-in card still works from here", () => {
    expect(html).toContain("Sign in with Fountain");
    expect(html).toContain("paste an API key instead");
  });
});

// Enrolling used to be a box you typed `owner/name` into. The rail now offers
// what the App can already reach, so these are about what it offers unasked.
describe("RepoPicker", () => {
  const repo = (slug: string, over: Partial<AccessibleRepo> = {}): AccessibleRepo => ({
    slug,
    private: false,
    fork: false,
    archived: false,
    pushedAt: new Date(Date.now() - 86400_000).toISOString(),
    description: null,
    ...over,
  });

  const render = (over: Partial<Parameters<typeof RepoPicker>[0]> = {}) =>
    renderToString(
      <RepoPicker
        repos={[repo("o/web"), repo("o/api"), repo("o/ancient", { archived: true, pushedAt: "2019-01-01T00:00:00Z" })]}
        enrolledKeys={new Set()}
        skipped={new Set()}
        busy={null}
        ready
        loading={false}
        onEnroll={() => {}}
        onSkip={() => {}}
        onUnskip={() => {}}
        {...over}
      />,
    );

  test("offers the active repositories without being asked, with a way to search", () => {
    const html = render();
    expect(html).toContain("o/web");
    expect(html).toContain("o/api");
    expect(html).toContain("Search repositories");
  });

  test("holds back the quiet ones rather than burying the list, and says how many", () => {
    const html = render().replace(/<!-- -->/g, "");
    expect(html).not.toContain("o/ancient");
    expect(html).toContain("1 more, quiet or archived");
  });

  test("never offers something already enrolled", () => {
    const html = render({ enrolledKeys: new Set([keyOfSlug("o/web")]) });
    expect(html).not.toContain("o/web");
    expect(html).toContain("o/api");
  });

  test("every row can be enrolled or waved away — that is the whole interaction", () => {
    const html = render();
    expect(html).toContain("Enroll");
    expect(html).toContain("skip");
  });

  test("says what a one-click enroll commits to, since it does not ask", () => {
    expect(render()).toContain("weekly cadence and the mechanical fixes only");
  });

  test("shows nothing at all until GitHub is signed in and the App is on", () => {
    expect(render({ ready: false })).toBe("");
  });
});
