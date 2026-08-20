# Rounds

**Dependabot, for the configuration rather than the dependencies.**

Enrol a repository and [`chant audit`](https://intentius.io/chant/cli/audit/)
runs over its CI workflows, Kubernetes manifests, Dockerfiles, Helm charts and
cloud templates on a schedule. When it finds something worth a pull request, an
agent fixes it, verifies the fix, and opens one. You meet the work on GitHub.

This is [Mend](https://github.com/jhgaylor/mend)'s ambient sibling. Mend is the
interactive version: you point it at any public repo, watch it work, and take a
patch. Rounds is the version you turn on and forget — same audit, same agent,
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

## The token

Rounds pushes and opens pull requests with nobody present, so unlike Mend there
is no browser to hold a credential. The token is a secret on the shared
**`Rounds toolkit`** Fountain environment: encrypted there, never returned by the
API, and this page can write it once but never read it back.

Use a **fine-grained** token with *Contents: read and write* and *Pull requests:
read and write*, **scoped to exactly the repositories you enrol**. The agent
reads untrusted repository content during the audit and holds that token while
it does, so its blast radius should be the repos you meant and nothing else. For
anything beyond personal use the right answer is a GitHub App with a per-repo
installation token rather than a PAT.

Without a token Rounds still audits and reports — it just cannot open anything,
and the app says so.

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
