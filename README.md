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
6. **Open one pull request per file**, with the rules cited and the before/after
   counts in the body.
7. **Report** a `round` block, which is what this app renders.

State lives in GitHub, not in a database: the branch name (`rounds/<file-key>`)
plus a marker in the PR body are how a later round recognises its own work. That
is Dependabot's trick and it means nothing to keep in sync.

## The rules it runs under

Written into the agent's prompt (`src/lib/spec.ts`), because an unattended bot
that is wrong is worse than no bot at all:

- Never reopen what a human closed.
- Never open a second pull request for something already proposed.
- Never touch anything outside the fix — no reformatting, no drive-by edits.
- Never force-push, never touch a branch that is not `rounds/*`, never comment
  on or close a pull request it did not open.
- At most **3** rounds pull requests open at once; over the cap it opens nothing
  and says so.
- A clean round is a good round. When in doubt, open nothing and explain why.

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

Sign in with Fountain (or paste an API key), then enrol a repo and pick a
cadence. Server-side requirements, same as any external Fountain client:

```
API_CORS_ORIGINS=http://localhost:5181
OAUTH_CLIENTS='[{"id":"rounds","name":"Rounds","redirect_uris":["http://localhost:5181/"]}]'
```

## The credential

Rounds pushes and opens pull requests with nobody present, so unlike Mend there
is no browser to hold a credential at run time. There are three ways it can be
armed, and the narrowest one wins:

| what the agent carries | what it is | when |
|---|---|---|
| a **grant** in the repo's vault | a signed note that you authorised work on that repo — not a GitHub credential on its own | **the default**, once you sign in with GitHub |
| a **token** in the repo's vault | a standing GitHub token, scoped to that repo | no App, or a host other than GitHub |
| a token on the shared environment | a standing token for every enrolled repo | convenience |

**Sign in with GitHub** and enrolling a repository asks this deployment's own
backend for a grant. Each round the agent trades that grant for an installation
token that lasts an hour and reaches exactly one repository — so nothing
standing is ever stored, and revoking is uninstalling the App rather than
hunting down a token.

It also unlocks the findings that matter most: a token minted from the App
carries **`workflows: write`**, so the agent may fix `.github/workflows`. A bare
personal token cannot, unless it was minted with the `workflow` scope.

### Why there is a server here

An App's private key mints installation tokens for *every* installation of the
App, which makes it far too broad to sit on a Fountain environment where an
agent that reads untrusted repository content could reach it. So Bun serves the
built SPA **and** the four endpoints that need a secret — same image, same
origin, no CORS, nothing extra to deploy:

```
GET  /gh/app        what the App is, so the UI can offer to install it
GET  /gh/callback   finishes "Sign in with GitHub"
POST /gh/grant      mints a grant, after checking you can push there
POST /gh/token      trades a grant for a one-hour, one-repo token
```

Both minting paths verify the caller can actually push to the repository first;
without that, asking for a grant would be a way to borrow the App's access to
someone else's repo. Grants are HMAC-signed rather than stored, so there is no
database — and revocation still works, because it lives at GitHub.

With no App configured, `/gh` answers 503 and everything falls back to tokens.

## Development

```bash
bun test           # cron, round protocol, host parsing, ACP blocks, SSE, render smoke
bun run typecheck
bun run build
```

To work without a live Fountain, run the mock (`bun run mock`), start the app
with `FOUNTAIN_PROXY=http://localhost:8790 bun run dev`, and use
`http://localhost:5181` as the Fountain URL with any string as the key. It
serves one enrolled repo with three rounds behind it, covering every cluster
status the UI renders. Flip `secrets` to `[]` in `mock/server.ts` to develop
against the missing-token gate.

No state outside the browser: settings in `localStorage` (`rounds.settings`).
Everything else — which repos are enrolled, their cadence, every past round —
lives in Fountain as agents, schedules and conversations.

## Deploy

Static files behind nginx: CI builds the bundle, bakes
`ghcr.io/jhgaylor/rounds`, pins the sha into `k8s/deployment.yaml`, and Flux
rolls it out at `rounds.inevitable.fyi`.

## License

MIT
