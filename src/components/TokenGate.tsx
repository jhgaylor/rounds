/**
 * The one credential this product cannot do without.
 *
 * Rounds opens pull requests with nobody watching, so the token lives on the
 * Fountain environment (encrypted there, never returned by the API) rather
 * than in this page. The app can write it once, and after that only ever
 * learns whether the key exists — which is all it needs to tell you the
 * schedules will actually be able to push.
 */
import { useState } from "react";
import { TOKEN_KEY } from "../lib/spec";

export function TokenGate(props: {
  /** null while unknown, true/false once the environment's keys have been read. */
  present: boolean | null;
  saving: boolean;
  /** This repo has its own vault token, so the shared one does not gate it. */
  overridden?: boolean;
  onSave: (token: string) => void;
}) {
  const [value, setValue] = useState("");
  const [open, setOpen] = useState(false);

  if (props.present === null) return null;

  // A repo with its own vault token needs nothing from the shared environment.
  if (props.overridden) {
    return (
      <div className="tokenrow ok">
        <span className="dot on" />
        <span className="fineprint">
          This repository has its own <code>{TOKEN_KEY}</code> in a vault, which overrides the shared one.
        </span>
      </div>
    );
  }

  if (props.present) {
    return (
      <div className="tokenrow ok">
        <span className="dot on" />
        <span className="fineprint">
          <code>{TOKEN_KEY}</code> is set on the toolkit environment — rounds can push and open pull requests.
        </span>
      </div>
    );
  }

  return (
    <div className="tokengate">
      <div className="tokenrow warn">
        <span className="dot warnDot" />
        <span className="fineprint">
          No <code>{TOKEN_KEY}</code> on the toolkit environment. Rounds will still audit and report, but it cannot open
          pull requests until one is set.
        </span>
        <button className="linkish" onClick={() => setOpen((v) => !v)}>
          {open ? "cancel" : "set it"}
        </button>
      </div>
      {open && (
        <div className="tokenform">
          <p className="fineprint">
            A fine-grained token with <b>Contents: read and write</b> and <b>Pull requests: read and write</b>, scoped to
            exactly the repositories you enrol —{" "}
            <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noreferrer">
              create one
            </a>
            . It is stored as a secret on your Fountain environment, encrypted there and never returned by the API; this
            page sends it once and cannot read it back. Because an agent that reads untrusted repositories holds it, keep
            its scope to repositories you own.
          </p>
          <div className="tokenform-row">
            <input
              type="password"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && value.trim() && props.onSave(value.trim())}
              placeholder="github_pat_…"
              aria-label="GitHub token"
            />
            <button className="primary" disabled={props.saving || !value.trim()} onClick={() => props.onSave(value.trim())}>
              {props.saving ? "Saving…" : "Save to Fountain"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
