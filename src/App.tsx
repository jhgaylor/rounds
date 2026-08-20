/**
 * Rounds: a rail of enrolled repositories, each one an agent plus a cron.
 *
 * This page is a control panel, not the product. The product is what happens
 * while nobody is here: a Fountain schedule wakes the agent, it audits, it
 * opens a pull request, and you meet the work on GitHub. Everything shown is
 * derived from the schedules and the agents' own threads — nothing is stored
 * outside Fountain and this browser's settings.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ApiError, describeError, FountainClient } from "./api/client";
import type { Catalog, LogEvent, Schedule, TeamEvent, Teammate, Turn } from "./api/types";
import { blocksForTurn } from "./lib/acp";
import { cronError, describeCron, relativeTime } from "./lib/cron";
import { parseRepoInput, refKey, refLabel, repoUrl, type RepoRef } from "./lib/hosts";
import { completeLoginIfCallback, revoke } from "./lib/oauth";
import { foldRounds, type RoundEntry } from "./lib/protocol";
import { clearSettings, loadSettings, saveSettings, type Settings } from "./lib/settings";
import {
  agentDescription,
  agentName,
  CRON_PRESETS,
  DEFAULT_CRON,
  DEFAULT_POLICY,
  ENVIRONMENT_NAME,
  environmentSpec,
  refOfAgentName,
  ROUND_PROMPT,
  scheduleName,
  systemPrompt,
  TOKEN_KEY,
  type RoundsPolicy,
} from "./lib/spec";
import { Connect } from "./components/Connect";
import { RoundView } from "./components/RoundView";
import { TokenGate } from "./components/TokenGate";

const STREAMS = ["acp", "stdout", "stage"];
const DEFAULT_MODEL = "anthropic/claude-sonnet-5";

type Phase = "boot" | "connect" | "app";

interface Enrolled {
  ref: RepoRef;
  key: string;
  teammate: Teammate;
  schedule: Schedule | null;
}

export function App() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [phase, setPhase] = useState<Phase>("boot");
  const [connectError, setConnectError] = useState<string | null>(null);

  const [team, setTeam] = useState<Teammate[] | null>(null);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [events, setEvents] = useState<LogEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [envId, setEnvId] = useState<string | null>(null);
  const [tokenPresent, setTokenPresent] = useState<boolean | null>(null);
  const [savingToken, setSavingToken] = useState(false);

  const client = useMemo(() => (settings ? new FountainClient(settings) : null), [settings]);
  const catalogRef = useRef<Catalog | null>(null);

  const say = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast((t) => (t === msg ? null : t)), 7000);
  }, []);

  // ── boot ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    void (async () => {
      try {
        const cb = await completeLoginIfCallback();
        if (cb) {
          const s: Settings = { baseUrl: cb.baseUrl, apiKey: cb.apiKey, via: "oauth" };
          saveSettings(s);
          setSettings(s);
          return;
        }
      } catch (err) {
        setConnectError(err instanceof Error ? err.message : String(err));
      }
      const stored = loadSettings();
      if (stored) setSettings(stored);
      else setPhase("connect");
    })();
  }, []);

  useEffect(() => {
    if (settings) setPhase("app");
  }, [settings]);

  const signOut = useCallback(() => {
    if (settings?.via === "oauth") void revoke(settings.baseUrl, settings.apiKey);
    clearSettings();
    setSettings(null);
    setTeam(null);
    setSelected(null);
    setPhase("connect");
  }, [settings]);

  // ── the roster and its schedules ─────────────────────────────────────────

  const refresh = useCallback(async () => {
    if (!client) return;
    try {
      const [roster, scheds] = await Promise.all([client.listTeam(), client.listAllSchedules().catch(() => [])]);
      setTeam(roster);
      setSchedules(scheds);
    } catch (err) {
      say(describeError(err));
    }
  }, [client, say]);

  useEffect(() => {
    if (phase === "app") void refresh();
  }, [phase, refresh]);

  // The toolkit environment, and whether it can actually push.
  const checkEnvironment = useCallback(async () => {
    if (!client) return;
    try {
      const env = (await client.listEnvironments()).find((e) => e.name === ENVIRONMENT_NAME);
      if (!env) {
        setEnvId(null);
        setTokenPresent(null);
        return;
      }
      setEnvId(env.id);
      const keys = await client.listSecretKeys(env.id).catch(() => []);
      setTokenPresent(keys.some((k) => k.key === TOKEN_KEY));
    } catch {
      // Not fatal — enrolling will create what is missing.
    }
  }, [client]);

  useEffect(() => {
    if (phase === "app") void checkEnvironment();
  }, [phase, checkEnvironment]);

  const enrolled: Enrolled[] = useMemo(() => {
    const byAgent = new Map(schedules.map((s) => [s.agent_id, s]));
    const out: Enrolled[] = [];
    for (const t of team ?? []) {
      const ref = refOfAgentName(t.name);
      if (ref) out.push({ ref, key: refKey(ref), teammate: t, schedule: byAgent.get(t.agent_id) ?? null });
    }
    return out.sort((a, b) => a.key.localeCompare(b.key));
  }, [team, schedules]);

  const current = selected ? enrolled.find((e) => e.key === selected) ?? null : null;
  const convId = current?.teammate.conversation.id ?? null;
  const convIdRef = useRef<string | null>(null);
  convIdRef.current = convId;

  const pickedRef = useRef(false);
  useEffect(() => {
    if (team === null || pickedRef.current) return;
    pickedRef.current = true;
    if (!selected && enrolled.length > 0) setSelected(enrolled[0]!.key);
  }, [team, enrolled, selected]);

  // ── the selected repo's rounds ───────────────────────────────────────────

  const reloadThread = useCallback(async () => {
    if (!client || !convId) return;
    try {
      const [t, e] = await Promise.all([client.listTurns(convId), client.listAllEvents(convId, STREAMS)]);
      setTurns(t);
      setEvents(e);
    } catch (err) {
      say(describeError(err));
    }
  }, [client, convId, say]);

  useEffect(() => {
    if (convId) void reloadThread();
  }, [convId, reloadThread]);

  useEffect(() => {
    if (!client || phase !== "app") return;
    const ctrl = new AbortController();
    let lastEventId: string | null = null;
    let backoff = 1000;
    let stopped = false;

    const connect = () => {
      if (stopped) return;
      void client.streamTeam({
        lastEventId,
        streams: STREAMS,
        signal: ctrl.signal,
        onOpen: () => {
          setConnected(true);
          backoff = 1000;
          void refresh();
          void reloadThread();
        },
        onMessage: (msg) => {
          if (msg.id) lastEventId = msg.id;
          if (msg.event === "team") {
            void refresh();
            return;
          }
          let ev: TeamEvent;
          try {
            ev = JSON.parse(msg.data) as TeamEvent;
          } catch {
            return;
          }
          if (msg.id) ev.id = Number(msg.id);
          if (ev.conversation_id !== convIdRef.current) {
            if (ev.kind === "stage" && ev.stage === "turn" && ev.state !== "started") void refresh();
            return;
          }
          setEvents((es) => (es.some((e) => e.id === ev.id) ? es : [...es, ev]));
          if (ev.kind === "stage" && ev.stage === "turn") {
            void client.listTurns(ev.conversation_id).then(setTurns).catch(() => undefined);
            if (ev.state !== "started") {
              void client.markRead(ev.conversation_id).catch(() => undefined);
              void refresh();
            }
          }
        },
        onClose: () => {
          setConnected(false);
          if (stopped) return;
          window.setTimeout(connect, backoff);
          backoff = Math.min(backoff * 2, 15000);
        },
      });
    };
    connect();
    return () => {
      stopped = true;
      ctrl.abort();
    };
  }, [client, phase, refresh, reloadThread]);

  const runtime = current?.teammate.conversation.runtime ?? "claude";
  const rounds: RoundEntry[] = useMemo(() => {
    const sorted = [...turns].sort((a, b) => a.turn_number - b.turn_number);
    const byTurn = new Map<string, LogEvent[]>();
    for (const ev of events) {
      if (!ev.turn_id) continue;
      const list = byTurn.get(ev.turn_id);
      if (list) list.push(ev);
      else byTurn.set(ev.turn_id, [ev]);
    }
    return foldRounds(
      sorted.map((turn) => ({
        reply: blocksForTurn(byTurn.get(turn.id) ?? [], runtime)
          .filter((b): b is Extract<ReturnType<typeof blocksForTurn>[number], { kind: "text" }> => b.kind === "text")
          .map((b) => b.body)
          .join(""),
        ranAt: turn.ended_at ?? turn.started_at ?? turn.inserted_at,
      })),
    );
  }, [turns, events, runtime]);

  const running = turns.some((t) => t.ended_at === null && t.status !== "failed");

  // ── actions ───────────────────────────────────────────────────────────────

  const ensureEnvironment = useCallback(async (): Promise<string | undefined> => {
    if (!client) return undefined;
    if (envId) return envId;
    try {
      const existing = (await client.listEnvironments()).find((e) => e.name === ENVIRONMENT_NAME);
      const env = existing ?? (await client.createEnvironment(environmentSpec()));
      setEnvId(env.id);
      return env.id;
    } catch (err) {
      say(`Could not set up the ${ENVIRONMENT_NAME} environment: ${describeError(err)}`);
      return undefined;
    }
  }, [client, envId, say]);

  const saveToken = useCallback(
    async (token: string) => {
      if (!client) return;
      setSavingToken(true);
      try {
        const id = await ensureEnvironment();
        if (!id) return;
        await client.putSecret(id, TOKEN_KEY, token);
        setTokenPresent(true);
        say("Token saved to the toolkit environment. Rounds can open pull requests from the next run.");
      } catch (err) {
        say(describeError(err));
      } finally {
        setSavingToken(false);
      }
    },
    [client, ensureEnvironment, say],
  );

  const enroll = useCallback(
    async (input: string, cron: string, policy: RoundsPolicy) => {
      if (!client) return;
      const ref = parseRepoInput(input);
      if (!ref) {
        say("That doesn't look like a repo — use owner/name, or a URL on github.com, gitlab.com or codeberg.org.");
        return;
      }
      if (ref.host !== "github.com") {
        say("Rounds opens pull requests on GitHub only. Audit a GitLab or Codeberg repo with Mend instead.");
        return;
      }
      const key = refKey(ref);
      if (enrolled.some((e) => e.key === key)) {
        setSelected(key);
        return;
      }
      setAdding(key);
      try {
        const environmentId = await ensureEnvironment();
        const name = agentName(ref);
        const want = systemPrompt(ref, policy);
        let agent = (await client.listAgents(name)).find((a) => a.name === name);
        if (agent) {
          if (agent.system !== want) agent = await client.updateAgent(agent.id, { system: want, description: agentDescription(ref) });
        } else {
          if (!catalogRef.current) catalogRef.current = await client.getCatalog().catch(() => null);
          const models = Object.values(catalogRef.current?.models ?? {}).flat();
          const model = models.includes(DEFAULT_MODEL) ? DEFAULT_MODEL : models.find((m) => m.startsWith("anthropic/")) ?? DEFAULT_MODEL;
          agent = await client.createAgent({
            name,
            description: agentDescription(ref),
            model,
            runtime: "claude",
            system: want,
            ...(environmentId ? { environment_id: environmentId } : {}),
          });
        }
        await client.addTeammate({ agent_id: agent.id, name, ...(environmentId ? { environment_id: environmentId } : {}) });
        await client.createSchedule(agent.id, {
          name: scheduleName(ref),
          cron,
          prompt: ROUND_PROMPT,
          enabled: true,
        });
        await refresh();
        setSelected(key);
        say(`Enrolled ${refLabel(ref)} — ${describeCron(cron).toLowerCase()}. Press Run now for the first round.`);
      } catch (err) {
        say(describeError(err));
      } finally {
        setAdding(null);
      }
    },
    [client, enrolled, ensureEnvironment, refresh, say],
  );

  const runNow = useCallback(
    async (e: Enrolled) => {
      if (!client || !e.schedule) return;
      setBusy(true);
      try {
        await client.runSchedule(e.teammate.agent_id, e.schedule.id);
        await Promise.all([refresh(), reloadThread()]);
        say("Round started.");
      } catch (err) {
        if (err instanceof ApiError && err.status === 409) say("A round is already running for this repository.");
        else say(describeError(err));
      } finally {
        setBusy(false);
      }
    },
    [client, refresh, reloadThread, say],
  );

  const setEnabled = useCallback(
    async (e: Enrolled, enabled: boolean) => {
      if (!client || !e.schedule) return;
      try {
        await client.updateSchedule(e.teammate.agent_id, e.schedule.id, { enabled });
        await refresh();
      } catch (err) {
        say(describeError(err));
      }
    },
    [client, refresh, say],
  );

  const setCron = useCallback(
    async (e: Enrolled, cron: string) => {
      if (!client || !e.schedule) return;
      const bad = cronError(cron);
      if (bad) {
        say(bad);
        return;
      }
      try {
        await client.updateSchedule(e.teammate.agent_id, e.schedule.id, { cron });
        await refresh();
        say(`Now running ${describeCron(cron).toLowerCase()}.`);
      } catch (err) {
        say(describeError(err));
      }
    },
    [client, refresh, say],
  );

  const unenroll = useCallback(
    async (e: Enrolled) => {
      if (!client) return;
      if (!window.confirm(`Stop rounds for ${refLabel(e.ref)}? The schedule and the agent's computer go away. Pull requests it already opened stay open.`)) return;
      try {
        if (e.schedule) await client.deleteSchedule(e.teammate.agent_id, e.schedule.id).catch(() => undefined);
        await client.removeTeammate(e.teammate.agent_id);
        if (selected === e.key) setSelected(null);
        await refresh();
      } catch (err) {
        say(describeError(err));
      }
    },
    [client, refresh, selected, say],
  );

  // ── render ────────────────────────────────────────────────────────────────

  if (phase === "boot") return <div className="setup" />;
  if (phase === "connect" || !settings || !client)
    return (
      <Connect
        error={connectError}
        onPaste={(s) => {
          saveSettings(s);
          setConnectError(null);
          setSettings(s);
        }}
      />
    );

  const pending = adding && !enrolled.some((e) => e.key === adding) ? adding : null;

  return (
    <div className="app">
      <aside className="rail">
        <div className="wordmark small">
          Rounds<span>.</span>
        </div>
        <nav className="repolist">
          {enrolled.map((e) => (
            <button key={e.key} className={e.key === selected ? "repobtn active" : "repobtn"} onClick={() => setSelected(e.key)}>
              <code>{refLabel(e.ref)}</code>
              <span className="repostate">
                {e.schedule && !e.schedule.enabled && <i className="paused">paused</i>}
                {e.schedule?.last_error && <i className="unread" title={e.schedule.last_error} />}
              </span>
            </button>
          ))}
          {pending && (
            <div className="repobtn pending">
              <code>{pending}</code>
              <span className="repostate">enrolling…</span>
            </div>
          )}
          {team !== null && enrolled.length === 0 && !pending && <p className="fineprint">Nothing enrolled yet.</p>}
        </nav>
        <div className="rail-foot">
          <span className={connected ? "dot on" : "dot"} title={connected ? "live" : "reconnecting"} />
          <button className="linkish" onClick={signOut}>
            sign out
          </button>
          <p className="fineprint">
            The audit is <a href="https://intentius.io/chant/cli/audit/">chant</a>. The cron and the computer are{" "}
            <a href="https://github.com/BinaryBourbon/fountain">Fountain</a>.{" "}
            <a href="https://github.com/jhgaylor/rounds">Source</a>.
          </p>
        </div>
      </aside>

      <main className="main">
        {toast && <div className="toast">{toast}</div>}
        {current ? (
          <>
            <header className="repo-head">
              <a href={repoUrl(current.ref)} target="_blank" rel="noreferrer">
                <code>{refLabel(current.ref)}</code>
              </a>
              {current.schedule ? (
                <span className="fineprint">
                  {describeCron(current.schedule.cron)}
                  {current.schedule.enabled
                    ? ` · next ${relativeTime(current.schedule.next_run_at)}`
                    : " · paused"}
                  {current.schedule.last_run_at && ` · last ran ${relativeTime(current.schedule.last_run_at)}`}
                </span>
              ) : (
                <span className="fineprint">no schedule — this repo will not run on its own</span>
              )}
              <div className="head-actions">
                <button disabled={busy || running || !current.schedule} onClick={() => void runNow(current)}>
                  {running ? "Running…" : "Run now"}
                </button>
                {current.schedule && (
                  <button onClick={() => void setEnabled(current, !current.schedule!.enabled)}>
                    {current.schedule.enabled ? "Pause" : "Resume"}
                  </button>
                )}
                <button className="linkish" onClick={() => void unenroll(current)}>
                  remove
                </button>
              </div>
            </header>

            <div className="scroll">
              <TokenGate present={tokenPresent} saving={savingToken} onSave={(t) => void saveToken(t)} />
              {current.schedule?.last_error && (
                <div className="status-card failed">
                  <p>Last scheduled run failed: {current.schedule.last_error}</p>
                </div>
              )}
              {current.schedule && (
                <CadencePicker cron={current.schedule.cron} onChange={(c) => void setCron(current, c)} />
              )}
              <RoundView entries={rounds} repo={current.ref} running={running} />
            </div>
          </>
        ) : (
          <div className="hero">
            <div className="hero-card">
              <h1>
                Your infrastructure config, kept up to standard — on a <b>schedule</b>.
              </h1>
              <p>
                <a href="https://intentius.io/chant/cli/audit/">chant</a> audits the repositories you enrol — CI
                workflows, Kubernetes manifests, Dockerfiles, Helm charts, cloud templates — and an agent opens a pull
                request for what it can fix and verify. One PR per file, never a second for something you already have
                open, and never again for one you closed.
              </p>
              <p className="fineprint">
                It runs whether or not this page is open. You meet the work on GitHub.
              </p>
              <EnrollForm big disabled={adding !== null} onEnroll={(v, c, p) => void enroll(v, c, p)} />
              {pending && (
                <p className="fineprint">
                  Enrolling <code>{pending}</code>…
                </p>
              )}
            </div>
          </div>
        )}
        {current && <EnrollForm disabled={adding !== null} onEnroll={(v, c, p) => void enroll(v, c, p)} />}
      </main>
    </div>
  );
}

function EnrollForm(props: {
  onEnroll: (repo: string, cron: string, policy: RoundsPolicy) => void;
  disabled: boolean;
  big?: boolean;
}) {
  const [value, setValue] = useState("");
  const [cron, setCron] = useState(DEFAULT_CRON);
  const [judgement, setJudgement] = useState(false);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!value.trim()) return;
    props.onEnroll(value.trim(), cron, { ...DEFAULT_POLICY, includeNeedsReview: judgement });
    setValue("");
  };
  return (
    <form className={props.big ? "enroll big" : "enroll"} onSubmit={submit}>
      <div className="enroll-row">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="owner/name — a GitHub repo you can push to"
          disabled={props.disabled}
          aria-label="repository"
        />
        <select value={cron} onChange={(e) => setCron(e.target.value)} aria-label="cadence" disabled={props.disabled}>
          {CRON_PRESETS.map((p) => (
            <option key={p.cron} value={p.cron}>
              {p.label}
            </option>
          ))}
        </select>
        <button type="submit" className="primary" disabled={props.disabled || !value.trim()}>
          {props.disabled ? "…" : "Enrol"}
        </button>
      </div>
      <label className="judgement">
        <input type="checkbox" checked={judgement} onChange={(e) => setJudgement(e.target.checked)} />
        <span>
          Also propose the judgement calls — chant's guidance findings, fixed by the agent rather than only the
          mechanical ones. More value, more to review.
        </span>
      </label>
    </form>
  );
}

function CadencePicker(props: { cron: string; onChange: (cron: string) => void }) {
  const [custom, setCustom] = useState(props.cron);
  const known = CRON_PRESETS.some((p) => p.cron === props.cron);
  const [open, setOpen] = useState(false);
  const bad = cronError(custom);
  return (
    <div className="cadence">
      <span className="fineprint">Cadence</span>
      <select value={known ? props.cron : "custom"} onChange={(e) => (e.target.value === "custom" ? setOpen(true) : props.onChange(e.target.value))}>
        {CRON_PRESETS.map((p) => (
          <option key={p.cron} value={p.cron}>
            {p.label}
          </option>
        ))}
        <option value="custom">Custom…</option>
      </select>
      {(open || !known) && (
        <>
          <input value={custom} onChange={(e) => setCustom(e.target.value)} aria-label="cron expression" className="cronin" />
          <button disabled={!!bad || custom === props.cron} onClick={() => props.onChange(custom)}>
            Set
          </button>
          <span className={bad ? "error" : "fineprint"}>{bad ?? describeCron(custom)}</span>
        </>
      )}
    </div>
  );
}
