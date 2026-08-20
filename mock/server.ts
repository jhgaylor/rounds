/**
 * A tiny mock Fountain for developing Rounds offline: one enrolled repo with
 * a weekly schedule and three rounds behind it — a first round that opened
 * two pull requests, a quiet one, and a latest round showing every status the
 * UI has to render (opened, already open, declined, held back, failed).
 *
 * `bun run mock`, then `FOUNTAIN_PROXY=http://localhost:8790 bun run dev`, and
 * enter http://localhost:5181 as the Fountain URL with any string as the key.
 */

const chunk = (text: string) =>
  JSON.stringify({
    jsonrpc: "2.0",
    method: "session/update",
    params: { update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text } } },
  });

const round = (prose: string, body: unknown) => chunk(`${prose}\n\n\`\`\`round\n${JSON.stringify(body)}\n\`\`\``);

const REPO = "example/platform";

const ROUND_1 = round(
  "First round on this repo. chant found 11 things; I opened two pull requests for the mechanical ones and left the rest alone.",
  {
    at: "2026-08-06T09:00:00Z",
    commit: "1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b",
    branch: "main",
    scanned: 18,
    summary: { total: 11, quickWin: 4, needsReview: 5, reportOnly: 2 },
    clusters: [
      { key: "github-workflows-ci-yml", file: ".github/workflows/ci.yml", status: "opened", pr: 38, url: `https://github.com/${REPO}/pull/38`, checkIds: ["GHA033", "GHA021"], title: "ci: harden workflow permissions and pin actions" },
      { key: "dockerfile", file: "Dockerfile", status: "opened", pr: 39, url: `https://github.com/${REPO}/pull/39`, checkIds: ["DKRD012"], title: "docker: pin the base image to a digest" },
      { key: "k8s-deployment-yaml", file: "k8s/deployment.yaml", status: "deferred", checkIds: ["WK8203", "WK8110"], note: "held back to stay under the 3 open pull request cap" },
    ],
    openPrs: 2,
    error: null,
  },
);

const ROUND_2 = round("Nothing new this week — both pull requests are still open, so I left them alone.", {
  at: "2026-08-13T09:00:00Z",
  commit: "1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b",
  branch: "main",
  scanned: 18,
  summary: { total: 11, quickWin: 4, needsReview: 5, reportOnly: 2 },
  clusters: [
    { key: "github-workflows-ci-yml", file: ".github/workflows/ci.yml", status: "already-open", pr: 38, url: `https://github.com/${REPO}/pull/38`, checkIds: ["GHA033", "GHA021"] },
    { key: "dockerfile", file: "Dockerfile", status: "already-open", pr: 39, url: `https://github.com/${REPO}/pull/39`, checkIds: ["DKRD012"] },
  ],
  openPrs: 2,
  error: null,
});

const ROUND_3 = round(
  "The Dockerfile pull request merged and the CI one was closed, so I will not raise that again. With room under the cap I opened the Kubernetes one that was held back. The Helm chart fix would not verify — the chart stopped templating — so I abandoned it rather than opening something broken.",
  {
    at: "2026-08-20T09:00:00Z",
    commit: "9f1c4a2b7e05d3118aa6c0f4e2b71d8e5c0a3f22",
    branch: "main",
    scanned: 19,
    summary: { total: 9, quickWin: 2, needsReview: 5, reportOnly: 2 },
    clusters: [
      { key: "k8s-deployment-yaml", file: "k8s/deployment.yaml", status: "opened", pr: 44, url: `https://github.com/${REPO}/pull/44`, checkIds: ["WK8203"], title: "k8s: run the web container as a non-root user" },
      { key: "github-workflows-ci-yml", file: ".github/workflows/ci.yml", status: "declined", pr: 38, url: `https://github.com/${REPO}/pull/38`, checkIds: ["GHA033", "GHA021"], note: "closed unmerged on 14 Aug — not raising it again" },
      { key: "charts-web-templates-deployment-yaml", file: "charts/web/templates/deployment.yaml", status: "failed", checkIds: ["WHM004"], note: "helm template failed after the edit; reverted and opened nothing" },
      { key: "gitlab-ci-yml", file: ".gitlab-ci.yml", status: "clean", checkIds: [] },
    ],
    openPrs: 1,
    error: null,
  },
);

const now = "2026-08-20T09:00:12.000000Z";
const ROUND_PROMPT = "Do a round now: refresh, audit, reconcile against the pull requests you have already opened, and open what is due. Report the round block.";

const turns = [
  { id: "t1", turn_number: 1, prompt: ROUND_PROMPT, status: "completed", exit_code: 0, started_at: "2026-08-06T09:00:00Z", ended_at: "2026-08-06T09:03:00Z", inserted_at: "2026-08-06T09:00:00Z" },
  { id: "t2", turn_number: 2, prompt: ROUND_PROMPT, status: "completed", exit_code: 0, started_at: "2026-08-13T09:00:00Z", ended_at: "2026-08-13T09:02:00Z", inserted_at: "2026-08-13T09:00:00Z" },
  { id: "t3", turn_number: 3, prompt: ROUND_PROMPT, status: "completed", exit_code: 0, started_at: "2026-08-20T09:00:00Z", ended_at: "2026-08-20T09:04:00Z", inserted_at: "2026-08-20T09:00:00Z" },
];

const events = [
  { turn: "t1", data: ROUND_1 },
  { turn: "t2", data: ROUND_2 },
  { turn: "t3", data: ROUND_3 },
].map((e, i) => ({ id: i + 1, kind: "output", stream: "acp", data: e.data, stage: null, state: null, turn_id: e.turn, ts: now }));

const agent = {
  id: "agent-rounds",
  name: `Rounds: github.com/${REPO}`,
  model: "anthropic/claude-sonnet-5",
  runtime: "claude",
  environment_id: "env-toolkit",
  allowed_vault_ids: null,
  allowed_environment_ids: null,
  system: "…",
};

const teammate = {
  agent_id: agent.id,
  name: agent.name,
  agent,
  conversation: {
    id: "c1",
    title: agent.name,
    agent_id: agent.id,
    vault_id: null,
    environment_id: "env-toolkit",
    runtime: "claude",
    acp: true,
    status: "idle",
    turn_count: turns.length,
    last_active_at: now,
    unread: false,
    inserted_at: now,
    updated_at: now,
  },
  presence: { state: "online", label: "online" },
  unread: false,
  last_turn: null,
};

const schedule = {
  id: "sched-1",
  agent_id: agent.id,
  name: `Rounds — ${REPO}`,
  cron: "0 9 * * 1",
  prompt: ROUND_PROMPT,
  enabled: true,
  one_off: false,
  last_run_at: "2026-08-20T09:00:00Z",
  next_run_at: "2026-08-27T09:00:00Z",
  last_error: null,
  last_conversation_id: "c1",
  inserted_at: "2026-08-06T09:00:00Z",
  updated_at: now,
};

const environment = { id: "env-toolkit", name: "Rounds toolkit", networking_type: "unrestricted", agent_count: 1 };
// Flip this to [] to develop against the "no token yet" gate.
// The toolkit environment holds no credentials any more — each repo's agent
// carries its own grant in its own vault.
const secrets: Array<{ key: string; inserted_at: string; updated_at: string }> = [];

const json = (data: unknown) => Response.json({ data });

Bun.serve({
  port: 8790,
  idleTimeout: 120,
  routes: {
    "/api/auth/me": json({ id: "u1", email: "dev@example.com", role: "user" }),
    "/api/catalog": json({ runtimes: ["claude"], models: { claude: ["anthropic/claude-sonnet-5"] } }),
    "/api/environments": json([environment]),
    "/api/environments/env-toolkit/secrets": json(secrets),
    "/api/agents": json([agent]),
    "/api/team": json([teammate]),
    "/api/team/schedules": json([schedule]),
    "/api/team/agent-rounds/schedules": json([schedule]),
    "/api/team/agent-rounds/schedules/sched-1/run": () => Response.json({ status: "queued" }),
    "/api/conversations/c1/turns": json(turns),
    "/api/conversations/c1/events": () => Response.json({ data: events, meta: { has_more: false, next_cursor: null } }),
    "/api/conversations/c1/read": new Response(null, { status: 204 }),
    "/api/team/stream": () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(": hello\n\n"));
          },
        }),
        { headers: { "content-type": "text/event-stream" } },
      ),
  },
  fetch: () => Response.json({ error: "not_found" }, { status: 404 }),
});

console.log("mock Fountain on http://localhost:8790");
