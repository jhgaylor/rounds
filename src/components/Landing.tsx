/**
 * The front door: what Rounds is, for somebody who has never seen it.
 *
 * Everything claimed here is checkable against the thing that does the work —
 * the rule counts come from chant's audit rules reference, and the tier split
 * is the one the agent actually runs under. A landing page that oversells an
 * unattended bot is worse than one that undersells it: the whole product is
 * somebody deciding to trust it with commit access while they are not looking.
 *
 * The sign-in card is the last thing on the page, not the first, because there
 * is nothing to sign into until you know what it does.
 */
import { Connect } from "./Connect";
import type { Settings } from "../lib/settings";

/** What chant audits, and how much of it. Counts from the audit rules reference. */
export const FAMILIES: Array<{ name: string; where: string; rules: number; eg: string }> = [
  { name: "GitHub Actions", where: ".github/workflows/*.yml", rules: 45, eg: "unpinned actions, missing permissions blocks, pull_request_target checking out untrusted code" },
  { name: "AWS CloudFormation", where: "*.template, *.yaml, *.json", rules: 50, eg: "public S3 buckets, open security groups, IAM wildcards, unencrypted storage" },
  { name: "GitLab CI", where: ".gitlab-ci.yml", rules: 39, eg: "undefined stages, rules that can never fire, invalid needs targets" },
  { name: "Kubernetes", where: "manifests, Argo, Flux", rules: 31, eg: "privileged containers, host namespaces, hardcoded secrets in env vars, unpinned images" },
  { name: "GCP Config Connector", where: "cnrm.cloud.google.com", rules: 26, eg: "public IAM members, Cloud SQL open to 0.0.0.0/0, missing encryption" },
  { name: "Azure ARM", where: "deployment templates", rules: 24, eg: "public blob access, missing TDE, HTTPS-only off, TLS below 1.2" },
  { name: "Helm", where: "any chart directory", rules: 21, eg: "root containers, :latest images, Secrets inlined into templates" },
  { name: "Docker", where: "Dockerfile, compose", rules: 6, eg: "no USER instruction, :latest base images, SSH exposed on 22" },
  { name: "Forgejo", where: ".forgejo/workflows", rules: 2, eg: "unresolvable action references, runner labels with no equivalent" },
];

export const TOTAL = FAMILIES.reduce((n, f) => n + f.rules, 0);

/**
 * How those rules split by what Rounds will do with them.
 *
 * Kept as numbers rather than prose because they have to add up to TOTAL, and
 * a landing page whose arithmetic has quietly rotted is worse than one with no
 * numbers on it. A test pins the sum.
 */
export const TIERS = { mechanical: 6, judgement: 153, hygiene: 85 } as const;

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
          Your CI workflows, Kubernetes manifests, Dockerfiles, Helm charts and cloud templates drift the same way
          dependencies do — a workflow pinned to a tag, a container still running as root, a bucket that quietly went
          public. Nobody gets a pull request about it. Rounds enrols a repository, audits it on a schedule with{" "}
          <a href="https://intentius.io/chant/cli/audit/">chant</a>, fixes what it can prove it fixed, and opens the
          pull request.
        </p>
        <div className="lp-herostats">
          <Stat n={String(TOTAL)} label="rules" />
          <Stat n={String(FAMILIES.length)} label="config formats" />
          <Stat n="1" label="pull request per file" />
          <Stat n="0" label="dashboards to check" />
        </div>
        <p className="fineprint">
          It runs whether or not this page is open. You meet the work on GitHub, in the review flow you already have.
        </p>
      </section>

      <section className="lp-section" id="what">
        <h2>What it watches</h2>
        <p className="lp-sub">
          One audit, every config file in the repository. {TOTAL} rules, each one citing its source — OSSF Scorecard,
          GitHub's own hardening guides, the cloud providers' security baselines.
        </p>
        <div className="lp-grid">
          {FAMILIES.map((f) => (
            <div className="lp-card" key={f.name}>
              <div className="lp-cardhead">
                <h3>{f.name}</h3>
                <span className="lp-count">{f.rules}</span>
              </div>
              <code className="lp-where">{f.where}</code>
              <p>{f.eg}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="lp-section" id="tiers">
        <h2>What it will actually open a pull request for</h2>
        <p className="lp-sub">
          This is the part most tools are vague about, so here it is plainly. chant sorts every finding into three
          tiers, and Rounds treats them differently on purpose.
        </p>

        <div className="lp-tiers">
          <div className="lp-tier on">
            <div className="lp-tierhead">
              <span className="lp-pill ok">on by default</span>
              <span className="lp-tiern">{TIERS.mechanical} rules</span>
            </div>
            <h3>Mechanical</h3>
            <p>
              chant knows the exact edit and produces the diff itself — pin an action to a commit SHA, pin an image to
              a digest, replace <code>write-all</code> with a least-privilege block. There is no judgement involved,
              so the agent applies the diff it was handed and nothing else.
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
            <p className="fineprint">
              Few rules, but the ones that fire most: almost every repository has an unpinned action or a missing{" "}
              <code>permissions:</code> block.
            </p>
          </div>

          <div className="lp-tier opt">
            <div className="lp-tierhead">
              <span className="lp-pill">one checkbox away</span>
              <span className="lp-tiern">{TIERS.judgement} rules</span>
            </div>
            <h3>Judgement calls</h3>
            <p>
              Worth a pull request, but the fix depends on what you meant — a container that may run as root, a{" "}
              <code>pull_request_target</code> that checks out untrusted code, a Cloud SQL instance open to the world.
              Tick <i>also propose the judgement calls</i> when you enrol and the agent makes the change itself, then
              re-runs the audit to prove the finding is gone and nothing new appeared. If it cannot verify it, it
              abandons the change and tells you why rather than opening it.
            </p>
            <p className="fineprint">This is the valuable half, and the half that needs a human reading it. That is exactly why it is opt-in.</p>
          </div>

          <div className="lp-tier off">
            <div className="lp-tierhead">
              <span className="lp-pill quiet">never</span>
              <span className="lp-tiern">{TIERS.hygiene} rules</span>
            </div>
            <h3>Hygiene</h3>
            <p>
              Deprecations, style, missing timeouts, duplicate workflow names. Real, worth knowing, not worth
              interrupting you over. These appear in the report and never become a pull request.
            </p>
          </div>
        </div>
      </section>

      <section className="lp-section" id="round">
        <h2>What one round does</h2>
        <div className="lp-steps">
          <Step n={1} title="Refresh">
            Clone at the head of the default branch, with a token that expires in an hour and can only read.
          </Step>
          <Step n={2} title="Reconcile before it decides">
            Ask what it has already proposed here. A pull request still open is left alone. One you{" "}
            <b>closed without merging is a no, permanently</b> — that finding is never raised again. One that merged
            and came back is treated as new, because it regressed.
          </Step>
          <Step n={3} title="Audit and cluster">
            Run chant, then group findings one cluster per file, so a fix to a workflow never arrives tangled with a
            fix to a Dockerfile.
          </Step>
          <Step n={4} title="Fix, then prove it">
            Apply the change and re-run the audit. The findings must be gone, the merge-worthy count must not have
            gone up, and every file it touched must still parse. <b>If it cannot verify, it opens nothing.</b>
          </Step>
          <Step n={5} title="Propose">
            One pull request per file, citing the rules with links to their reference and the before/after counts.
            Never more than three open at once.
          </Step>
        </div>
        <p className="lp-sub">
          A clean round opens nothing and says so. Most weeks, that is what you want from it.
        </p>
      </section>

      <section className="lp-section" id="trust">
        <h2>The agent cannot write to your repository</h2>
        <p className="lp-sub">
          An agent that reads configuration files out of a repository is reading input somebody else may control. So
          it is not given anything it could be talked into misusing.
        </p>
        <div className="lp-split">
          <div className="lp-card">
            <h3>What the agent holds</h3>
            <p>
              A signed note saying you authorised work on one repository. It is not a GitHub credential — on its own
              it opens nothing. Each round it buys a token that <b>can only read</b>, lasts an hour, and reaches
              exactly one repository.
            </p>
          </div>
          <div className="lp-card">
            <h3>What actually writes</h3>
            <p>
              This service. The agent sends its verified fix here and the commit, the branch and the pull request are
              made server-side, with a credential the agent never sees and that exists for the length of one request.
            </p>
          </div>
        </div>
        <p className="lp-sub">
          Which means the rules above are not promises in a prompt. The branch name is derived, not supplied; a
          cluster you declined is refused here; the cap is counted here. An agent that decided to misbehave would be
          asking this service to do it, and would be turned down.
        </p>
        <p className="fineprint">
          Access is a GitHub App you install on the repositories you choose. Revoking is uninstalling it — there is no
          stored token anywhere to go hunting for.
        </p>
      </section>

      <section className="lp-section" id="policy">
        <h2>The repository sets its own terms</h2>
        <p className="lp-sub">
          Drop a <code>.rounds.yml</code> in the root and it overrides everything above. It is read and enforced by
          the service, not merely suggested to the agent.
        </p>
        <pre className="lp-code">
          <code>{`enabled: true              # false → the round does nothing at all
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
            Rounds runs on your own <a href="https://github.com/BinaryBourbon/fountain">Fountain</a> — one agent and
            one schedule per repository. Sign in, install the GitHub App on the repositories you want audited, pick a
            cadence.
          </p>
          <p className="fineprint">
            The interactive version is <a href="https://github.com/jhgaylor/mend">Mend</a>: point it at a repo, watch
            it work, take the patch. Rounds is the same audit with the opposite defaults, because nobody is watching
            when it runs.
          </p>
        </div>
        <Connect error={props.error} onPaste={props.onPaste} />
      </section>

      <footer className="lp-foot">
        <p className="fineprint">
          The audit is <a href="https://intentius.io/chant/cli/audit/">chant</a>. The schedule and the computer are{" "}
          <a href="https://github.com/BinaryBourbon/fountain">Fountain</a>.{" "}
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

function Step(props: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="lp-step">
      <span className="lp-stepn">{props.n}</span>
      <div>
        <h3>{props.title}</h3>
        <p>{props.children}</p>
      </div>
    </div>
  );
}
