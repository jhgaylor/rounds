/**
 * The front door: what Rounds is, for somebody who has never seen it.
 *
 * Everything claimed here is checkable against the thing that does the work —
 * the rule counts come from chant's audit rules reference, and the tier split
 * is the one a round actually runs under. A landing page that oversells an
 * unattended tool is worse than one that undersells it: the whole product is
 * somebody deciding to trust it with commit access while they are not looking.
 *
 * It sells the outcome — pull requests you can merge — rather than the
 * machinery that produces them. Nobody buying Dependabot is told what it is
 * made of, and the word for what runs here is "Rounds".
 *
 * It is also half the length it used to be. Every claim survived the cut; what
 * went was the second and third sentence making each one again. A page about
 * a tool whose whole pitch is "it will not waste your attention" cannot spend
 * eight hundred words asking for it.
 *
 * The sign-in card is the last thing on the page, not the first, because there
 * is nothing to sign into until you know what it does.
 */
import { Connect } from "./Connect";
import type { Settings } from "../lib/settings";

/** What chant audits, and how much of it. Counts from the audit rules reference. */
export const FAMILIES: Array<{ name: string; where: string; rules: number }> = [
  { name: "GitHub Actions", where: ".github/workflows/*.yml", rules: 45 },
  { name: "AWS CloudFormation", where: "*.template, *.yaml, *.json", rules: 50 },
  { name: "GitLab CI", where: ".gitlab-ci.yml", rules: 39 },
  { name: "Kubernetes", where: "manifests, Argo, Flux", rules: 31 },
  { name: "GCP Config Connector", where: "cnrm.cloud.google.com", rules: 26 },
  { name: "Azure ARM", where: "deployment templates", rules: 24 },
  { name: "Helm", where: "any chart directory", rules: 21 },
  { name: "Docker", where: "Dockerfile, compose", rules: 6 },
  { name: "Forgejo", where: ".forgejo/workflows", rules: 2 },
];

export const TOTAL = FAMILIES.reduce((n, f) => n + f.rules, 0);

/**
 * How those rules split by what Rounds will do with them.
 *
 * Kept as numbers rather than prose because they have to add up to TOTAL, and
 * a landing page whose arithmetic has quietly rotted is worse than one with no
 * numbers on it. A test pins the sum.
 */
export const TIERS = { mechanical: 6, judgment: 153, hygiene: 85 } as const;

export function Landing(props: { error: string | null; onPaste: (s: Settings) => void }) {
  return (
    <div className="landing">
      <header className="lp-nav">
        <div className="wordmark">
          Rounds<span>.</span>
        </div>
        <nav className="lp-navlinks">
          <a href="#what">What it watches</a>
          <a href="#tiers">What it will open</a>
          <a href="#trust">Why it is safe</a>
          <a href="https://github.com/jhgaylor/rounds">Source</a>
        </nav>
      </header>

      <section className="lp-hero">
        <p className="lp-eyebrow">Unattended configuration maintenance</p>
        <h1>
          Dependabot watches your dependencies.<br />
          <b>Nothing watches your configuration.</b>
        </h1>
        <p className="lp-lede">
          Workflows, manifests, Dockerfiles, Helm charts and cloud templates drift the way dependencies do, and nobody
          gets a pull request about it. Rounds audits them on a schedule with{" "}
          <a href="https://intentius.io/chant/cli/audit/">chant</a>, fixes what it can prove it fixed, and opens one.
        </p>
        <div className="lp-herostats">
          <Stat n={String(TOTAL)} label="rules" />
          <Stat n={String(FAMILIES.length)} label="config formats" />
          <Stat n="1" label="pull request per file" />
          <Stat n="0" label="dashboards to check" />
        </div>
        <p className="fineprint">
          It runs whether or not this page is open. You meet the work on GitHub.
        </p>
      </section>

      <section className="lp-section" id="what">
        <h2>What it watches</h2>
        <p className="lp-sub">
          {TOTAL} rules, each citing its source — OSSF Scorecard, GitHub's hardening guides, cloud provider baselines.
        </p>
        <div className="lp-grid tight">
          {FAMILIES.map((f) => (
            <div className="lp-card" key={f.name}>
              <div className="lp-cardhead">
                <h3>{f.name}</h3>
                <span className="lp-count">{f.rules}</span>
              </div>
              <code className="lp-where">{f.where}</code>
            </div>
          ))}
        </div>
        <p className="fineprint">
          Unpinned actions, missing <code>permissions:</code> blocks, public buckets, root containers, secrets inlined
          into Helm templates.
        </p>
      </section>

      <section className="lp-section" id="tiers">
        <h2>What it will actually open a pull request for</h2>
        <p className="lp-sub">chant sorts every finding into three tiers, and Rounds treats them differently on purpose.</p>

        <div className="lp-tiers">
          <div className="lp-tier on">
            <div className="lp-tierhead">
              <span className="lp-pill ok">on by default</span>
              <span className="lp-tiern">{TIERS.mechanical} rules</span>
            </div>
            <h3>Mechanical</h3>
            <p>
              chant produces the diff itself — pin an action to a SHA, an image to a digest, <code>write-all</code> to
              least privilege. No judgment involved, so Rounds applies it unchanged.
            </p>
            <pre className="lp-diff">
              <code>
                <span className="del">-permissions: write-all</span>
                {"\n"}
                <span className="add">+permissions:</span>
                {"\n"}
                <span className="add">+  contents: read</span>
              </code>
            </pre>
            <p className="fineprint">Few rules — and the ones that fire in almost every repository.</p>
          </div>

          <div className="lp-tier opt">
            <div className="lp-tierhead">
              <span className="lp-pill">one checkbox away</span>
              <span className="lp-tiern">{TIERS.judgment} rules</span>
            </div>
            <h3>Judgment calls</h3>
            <p>
              Worth a pull request, but the fix depends on what you meant — a container that may run as root, a{" "}
              <code>pull_request_target</code> checking out untrusted code. Tick the box when you enroll and Rounds
              makes the change itself.
            </p>
            <p className="fineprint">The valuable half, and the half that needs reading. Hence opt-in.</p>
          </div>

          <div className="lp-tier off">
            <div className="lp-tierhead">
              <span className="lp-pill quiet">never</span>
              <span className="lp-tiern">{TIERS.hygiene} rules</span>
            </div>
            <h3>Hygiene</h3>
            <p>
              Deprecations, style, missing timeouts: worth knowing, never worth interrupting you. They appear in the
              report and nowhere else.
            </p>
          </div>
        </div>
      </section>

      <section className="lp-section" id="trust">
        <h2>Nothing that reads your repository can write to it</h2>
        <p className="lp-sub">
          Configuration files are input somebody else may have written, so the half of Rounds that reads them holds
          nothing worth misusing.
        </p>
        <div className="lp-split">
          <div className="lp-card">
            <h3>What the audit holds</h3>
            <p>
              A signed note that you authorized work on one repository — not a GitHub credential. It buys a token that
              <b> can only read</b>, for an hour, for that repository.
            </p>
          </div>
          <div className="lp-card">
            <h3>What actually writes</h3>
            <p>
              This service, once the fix is verified, with a credential that never leaves it and lives for one request.
            </p>
          </div>
        </div>
        <p className="lp-sub">
          Which makes the rules enforcement rather than intent: a fix that fails re-verification opens nothing, a pull
          request you closed unmerged is never proposed again, the branch is derived rather than supplied, and at most
          three sit open at once.
        </p>
        <p className="fineprint">
          Access is a GitHub App you install on the repositories you choose. Revoking is uninstalling it — no stored
          token to go hunting for.
        </p>
      </section>

      <section className="lp-section" id="policy">
        <h2>The repository sets its own terms</h2>
        <p className="lp-sub">
          A <code>.rounds.yml</code> in the root overrides all of it, read and enforced by the service.
        </p>
        <pre className="lp-code">
          <code>{`enabled: true              # false → nothing happens at all
tiers: [quick-win]         # quick-win, needs-review
ignore: [GHA021]           # rule ids never to propose
paths_ignore: ["examples/**"]
max_open_prs: 3`}</code>
        </pre>
      </section>

      <section className="lp-cta">
        <div className="lp-ctacopy">
          <h2>Turn it on and forget it</h2>
          <p>
            Sign in, install the GitHub App where you want it, pick a cadence.
          </p>
        </div>
        <Connect error={props.error} onPaste={props.onPaste} />
      </section>

      <footer className="lp-foot">
        <p className="fineprint">
          The audit is <a href="https://intentius.io/chant/cli/audit/">chant</a>. The schedule and the computer are{" "}
          <a href="https://github.com/BinaryBourbon/fountain">Fountain</a>. The interactive version — point it at a
          repo, watch it work, take the patch — is <a href="https://github.com/jhgaylor/mend">Mend</a>.{" "}
          <a href="https://github.com/jhgaylor/rounds">Source</a>.
        </p>
      </footer>
    </div>
  );
}

function Stat(props: { n: string; label: string }) {
  return (
    <div className="lp-stat">
      <b>{props.n}</b>
      <span>{props.label}</span>
    </div>
  );
}
