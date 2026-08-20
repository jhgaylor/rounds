/**
 * What a round did — the record a maintainer checks when a pull request
 * shows up, or when one doesn't.
 *
 * The statuses carry the whole story of an ambient tool, so none of them are
 * hidden: what it opened, what it had already opened, what you declined and
 * it will never raise again, what it held back, and what it tried and could
 * not verify.
 */
import { useState } from "react";
import { fileUrl, type RepoRef } from "../lib/hosts";
import { relativeTime } from "../lib/cron";
import type { Cluster, ClusterStatus, RoundEntry } from "../lib/protocol";

const STATUS: Record<ClusterStatus, { label: string; tone: string; blurb: string }> = {
  opened: { label: "opened", tone: "ok", blurb: "a pull request went up this round" },
  "already-open": { label: "already open", tone: "brand", blurb: "proposed in an earlier round, still waiting on you" },
  declined: { label: "declined", tone: "mute", blurb: "you closed this one — it will never be raised again" },
  deferred: { label: "held back", tone: "warn", blurb: "kept back to stay under the open pull request cap" },
  failed: { label: "failed", tone: "danger", blurb: "it could not verify or push the fix, so it opened nothing" },
  clean: { label: "no action", tone: "mute", blurb: "considered, nothing to do" },
};

const RULE_DOC = (id: string) => `https://intentius.io/chant/lint-rules/audit-rules/#${id.toLowerCase()}`;

export function RoundView(props: { entries: RoundEntry[]; repo: RepoRef; running: boolean }) {
  const [showHistory, setShowHistory] = useState(false);
  const latest = props.entries[0];

  if (!latest) {
    return (
      <section className="round">
        <p className="fineprint">
          {props.running
            ? "First round in progress — it is cloning the repo and running chant now."
            : "No rounds yet. The first one runs on schedule, or press Run now."}
        </p>
      </section>
    );
  }

  const { round } = latest;
  const opened = round.clusters.filter((c) => c.status === "opened");

  return (
    <>
      <section className="round">
        <div className="round-head">
          <h3>Latest round</h3>
          <span className="fineprint">
            {relativeTime(latest.ranAt ?? latest.round.at ?? null)}
            {round.commit && ` · ${round.branch ?? "main"}@${round.commit.slice(0, 7)}`}
            {round.scanned !== undefined && ` · ${round.scanned} files`}
          </span>
        </div>

        {round.error ? (
          <p className="error">{round.error}</p>
        ) : (
          <>
            <div className="tiles">
              <Tile n={round.summary.total} label="findings" />
              <Tile n={opened.length} label="opened" tone={opened.length > 0 ? "ok" : undefined} />
              <Tile n={round.openPrs} label="awaiting you" tone={round.openPrs > 0 ? "brand" : undefined} />
            </div>
            {latest.prose && <p className="round-prose">{latest.prose}</p>}
            {round.clusters.length === 0 && <p className="fineprint">Nothing to act on this round.</p>}
            {round.clusters.length > 0 && (
              <div className="clusters">
                {round.clusters.map((c) => (
                  <ClusterRow key={c.key} cluster={c} repo={props.repo} branch={round.branch ?? "main"} />
                ))}
              </div>
            )}
          </>
        )}
      </section>

      {props.entries.length > 1 && (
        <section className="history">
          <button className="disclosure" onClick={() => setShowHistory((v) => !v)}>
            {`${showHistory ? "▾" : "▸"} Earlier rounds — ${props.entries.length - 1}`}
          </button>
          {showHistory && (
            <ul className="historylist">
              {props.entries.slice(1).map((e, i) => {
                const o = e.round.clusters.filter((c) => c.status === "opened").length;
                return (
                  <li key={i}>
                    <span className="when">{relativeTime(e.ranAt ?? e.round.at ?? null)}</span>
                    <span className="what">
                      {e.round.error
                        ? e.round.error
                        : o > 0
                          ? `opened ${o} pull request${o === 1 ? "" : "s"}`
                          : `${e.round.summary.total} findings, nothing new to propose`}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}
    </>
  );
}

function ClusterRow(props: { cluster: Cluster; repo: RepoRef; branch: string }) {
  const c = props.cluster;
  const s = STATUS[c.status];
  return (
    <div className={`cluster tone-${s.tone}`}>
      <div className="cluster-top">
        <span className={`status ${s.tone}`} title={s.blurb}>
          {s.label}
        </span>
        <a className="cfile" href={fileUrl(props.repo, props.branch, c.file)} target="_blank" rel="noreferrer">
          <code>{c.file}</code>
        </a>
        {c.pr !== undefined &&
          (c.url ? (
            <a className="prnum" href={c.url} target="_blank" rel="noreferrer">
              #{c.pr} ↗
            </a>
          ) : (
            <span className="prnum">#{c.pr}</span>
          ))}
      </div>
      {c.title && <div className="ctitle">{c.title}</div>}
      <div className="cmeta">
        {c.checkIds.map((id) => (
          <a key={id} className="ruleid" href={RULE_DOC(id)} target="_blank" rel="noreferrer">
            {id}
          </a>
        ))}
        {c.note && <span className="cnote">{c.note}</span>}
      </div>
    </div>
  );
}

function Tile(props: { n: number; label: string; tone?: string }) {
  return (
    <div className={props.tone ? `tile tone-${props.tone}` : "tile"}>
      <b>{props.n}</b>
      <span>{props.label}</span>
    </div>
  );
}
