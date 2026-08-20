# Rounds

**Dependabot, for the configuration rather than the dependencies.**

Enrol a repository — public or private — and
[`chant audit`](https://intentius.io/chant/cli/audit/) runs over its CI
workflows, Kubernetes manifests, Dockerfiles, Helm charts and cloud templates on
a schedule. When it finds something worth a pull request, an
agent fixes it, verifies the fix, and opens one. You meet the work on GitHub.

This is [Mend](https://github.com/jhgaylor/mend)'s ambient sibling. Mend is the
interactive version: you point it at a repo, watch it work, and take a patch. Rounds is the version you turn on and forget — same audit, same agent,
opposite defaults, because nobody is watching when it runs.

## What one round does

1. **Refresh** the clone to the head of the default branch.
2. **Read `.rounds.yml`**, if the repo has one — the repo's own policy wins.
3. **Audit** with chant.
4. **Reconcile against its own past work.** This is the step that decides
   whether an unattended tool is useful or a nuisance:
   - a rounds pull request already open for that file → leave it alone
   - one you **closed unmerged** → that is a no; never propose it again
   - one that merged and the finding came back → treat it as new
5. **Fix and verify.** Apply chant's deterministic diffs; for guidance findings,
   make the change only when confident it preserves behaviour. Then re-run the
   audit — the findings must be gone, the merge-worthy count must not have gone
   up, and every touched file must still parse. **If verification fails it
   abandons the cluster and opens nothing.**
6. **Propose one pull request per file** — the agent sends the fixed files to
   this app's server, which checks them against the repo's policy and its own
   history and opens the pull request. The agent cannot push; see
   [The credential](#the-credential).
7. **Report** a `round` block, which is what this app renders.

State lives in GitHub, not in a database: the branch name (`rounds/<file-key>`)
plus a marker in the PR body are how a later round recognises its own work. That
is Dependabot's trick and it means nothing to keep in sync. Both are written by
the server, so neither can be forgotten or forged by a round.

## The rules it runs under

An unattended bot that is wrong is worse than no bot at all. These are in the
agent's prompt (`src/lib/spec.ts`) **and**, for the ones that matter, in the
server that does the writing (`server/propose.ts`) — because a prompt is not a
boundary, and the agent spends its round reading files out of a repository it
does not control:

| rule | enforced where |
|---|---|
| Never reopen what a human closed | **server** — a closed-unmerged `rounds/*` PR refuses that cluster forever |
| Never open a second pull request for something already proposed | **server** — an open one on the branch refuses |
| Never write outside `rounds/*` | **server** — the branch is derived from the cluster key, never sent |
| At most **3** open at once (or your `max_open_prs`) | **server** — counted before anything is written |
| `enabled: false` means nothing happens | **server** — refuses every proposal |
| Never touch anything outside the fix — no reformatting, no drive-by edits | prompt |
| A clean round is a good round: when in doubt, propose nothing and explain why | prompt |

A refusal is not a failure. The round records it against the cluster —
`already-open`, `declined`, `deferred` — and moves on, which is exactly what
the app renders.

By default it only auto-opens the **mechanical** tier — chant's deterministic
findings, where the fix is known rather than judged. Tick *"also propose the
judgement calls"* when enrolling (or set `tiers` in `.rounds.yml`) to let the
agent take on the guidance findings too. That is the more valuable half and the
half that needs review, which is exactly why it is opt-in.

## `.rounds.yml`

Optional, in the audited repo, and it overrides everything above:

```yaml
enabled: true              # false → the round does nothing at all
tiers: [quick-win]         # quick-win, needs-review
ignore: [GHA021]           # rule ids never to propose
paths_ignore: ["examples/**"]
max_open_prs: 3
```

## Run it

```bash
bun install
bun run dev        # http://localhost:5181
```

Sign in with Fountain (or paste an API key), sign in with GitHub, install the
App, then enrol a repo and pick a cadence. Server-side requirements, same as any
external Fountain client:

```
API_CORS_ORIGINS=http://localhost:5181
OAUTH_CLIENTS='[{"id":"rounds","name":"Rounds","redirect_uris":["http://localhost:5181/"]}]'
```

## The credential

Rounds proposes pull requests with nobody present, so unlike Mend there is no
browser to hold a credential at run time. There is **one** way it is armed, and
the shape of it is the point:

| who | holds | can |
|---|---|---|
| the repo's agent | a **grant** in its own vault — a signed note that you authorised work on that repo, not a GitHub credential | trade it for a **read-only** token: clone, and nothing else |
| this app's server | the GitHub App's private key | mint a write token, for one repository, for the length of one proposal |

The agent spends its round reading configuration files out of a repository
whose contents it does not control. So it holds nothing that can write. When it
has a fix it has verified, it sends the changed files to `POST /gh/propose` and
the server commits them, names the branch and opens the pull request — having
first checked the repository's `.rounds.yml`, its open-PR count, and whether a
human already closed that cluster unmerged.

There is deliberately no way to hand it a personal access token instead. That
path existed, in three variants, and every one of them ended with a standing
credential that could push sitting next to an agent reading untrusted input.

**Sign in with GitHub**, install the App on the account that owns the repos, and
enrolling asks this deployment's backend for a grant. Nothing standing is ever
stored, and revoking is uninstalling the App rather than hunting down a token.

It also unlocks the findings that matter most: the App holds
**`workflows: write`**, so the server may commit fixes to `.github/workflows`.
A personal token cannot, unless it was minted with the `workflow` scope.

### Why there is a server here

Two reasons, and the second is the one that changed.

An App's private key mints installation tokens for *every* installation of the
App, which makes it far too broad to sit on a Fountain environment an agent can
reach. And the rules that make an unattended bot bearable — never reopen what a
human closed, never exceed the cap, never write outside `rounds/*` — are worth
nothing if the only thing enforcing them is a paragraph in a prompt held by
something that reads attacker-controlled files all day.

So Bun serves the built SPA **and** the endpoints that need either a secret or a
guarantee — same image, same origin, no CORS, nothing extra to deploy:

```
GET  /gh/app            what the App is, so the UI can offer to install it
GET  /gh/callback       finishes "Sign in with GitHub"
POST /gh/installations  where you have the App installed — the gate on enrolling
POST /gh/grant          mints a grant, after checking you can push there
POST /gh/token          trades a grant for a one-hour, one-repo, READ-ONLY token
POST /gh/state          what a round needs before it decides: HEAD, policy, its own past PRs
POST /gh/propose        the only path that writes
```

Everything a round calls is authorised by its grant, and the repository is read
off the grant's **signature** — never off the request. A round that asked to
propose against another repository would be asking with a grant that does not
say so, and would be refused before GitHub was called at all.

Grants are HMAC-signed rather than stored, so there is no database — and
revocation still works, because it lives at GitHub.

With no App configured, `/gh` answers 503 and nothing can be enrolled. There is
no fallback any more, by design.

## Development

```bash
bun test           # grants, propose enforcement, .rounds.yml, cron, protocol, hosts, ACP, SSE, render
bun run typecheck
bun run build
```

To work without a live Fountain, run the mock (`bun run mock`), start the app
with `FOUNTAIN_PROXY=http://localhost:8790 bun run dev`, and use
`http://localhost:5181` as the Fountain URL with any string as the key. It
serves one enrolled repo with three rounds behind it, covering every cluster
status the UI renders. The `/gh` endpoints need a real GitHub App, so enrolling
against the mock stops at the install gate.

No state outside the browser: settings in `localStorage` (`rounds.settings`).
Everything else — which repos are enrolled, their cadence, every past round —
lives in Fountain as agents, schedules and conversations.

## Deploy

Static files behind nginx: CI builds the bundle, bakes
`ghcr.io/jhgaylor/rounds`, pins the sha into `k8s/deployment.yaml`, and Flux
rolls it out at `rounds.inevitable.fyi`.

## License

MIT
