import { describe, expect, test } from "bun:test";
import { describeRound, foldRounds, openPullRequests, parseRounds, stripBlocks } from "./protocol";

const round = (body: string) => `Did a round.\n\n\`\`\`round\n${body}\n\`\`\``;

const FULL = round(`{"at":"2026-08-20T09:00:00Z","commit":"9f1c4a2","branch":"main","scanned":14,
 "summary":{"total":9,"quickWin":3,"needsReview":4,"reportOnly":2},
 "clusters":[
  {"key":"github-workflows-ci-yml","file":".github/workflows/ci.yml","status":"opened","pr":41,"url":"https://github.com/o/r/pull/41","checkIds":["GHA033"],"title":"ci: harden workflow permissions"},
  {"key":"dockerfile","file":"Dockerfile","status":"already-open","pr":38,"url":"https://github.com/o/r/pull/38","checkIds":["DKRD012"]},
  {"key":"k8s-deployment-yaml","file":"k8s/deployment.yaml","status":"declined","pr":31,"checkIds":["WK8110"]}],
 "openPrs":2,"error":null}`);

describe("parseRounds", () => {
  test("reads a round and strips it from the prose", () => {
    const [r] = parseRounds(FULL);
    expect(r!.commit).toBe("9f1c4a2");
    expect(r!.summary.quickWin).toBe(3);
    expect(r!.clusters).toHaveLength(3);
    expect(r!.openPrs).toBe(2);
    expect(stripBlocks(FULL)).toBe("Did a round.");
  });

  test("keeps every cluster status, including the ones with no action", () => {
    const [r] = parseRounds(FULL);
    expect(r!.clusters.map((c) => c.status)).toEqual(["opened", "already-open", "declined"]);
    expect(r!.clusters[0]!.url).toBe("https://github.com/o/r/pull/41");
  });

  test("an unknown status degrades rather than vanishing", () => {
    const [r] = parseRounds(round('{"summary":{},"clusters":[{"key":"a","file":"a.yml","status":"YOLO"}]}'));
    expect(r!.clusters[0]!.status).toBe("clean");
  });

  test("openPrs is recomputed when the agent omits it", () => {
    const [r] = parseRounds(round('{"summary":{},"clusters":[{"key":"a","file":"a","status":"opened","pr":1},{"key":"b","file":"b","status":"declined"}]}'));
    expect(r!.openPrs).toBe(1);
  });

  test("a non-https pr url is dropped", () => {
    const [r] = parseRounds(round('{"summary":{},"clusters":[{"key":"a","file":"a","status":"opened","url":"javascript:alert(1)"}]}'));
    expect(r!.clusters[0]!.url).toBeUndefined();
  });

  test("malformed or empty blocks are skipped", () => {
    expect(parseRounds("```round\n{not json\n```")).toEqual([]);
    expect(parseRounds("```round\n{}\n```")).toEqual([]);
    expect(parseRounds("no block here")).toEqual([]);
  });

  test("an error round survives even with nothing else in it", () => {
    const [r] = parseRounds(round('{"error":"repository is private","clusters":[],"summary":{}}'));
    expect(r!.error).toBe("repository is private");
  });
});

describe("foldRounds", () => {
  test("newest first, carrying Fountain's own timestamp", () => {
    const entries = foldRounds([
      { reply: round('{"summary":{"total":1},"clusters":[],"openPrs":0}'), ranAt: "2026-08-13T09:00:00Z" },
      { reply: FULL, ranAt: "2026-08-20T09:00:00Z" },
    ]);
    expect(entries).toHaveLength(2);
    expect(entries[0]!.ranAt).toBe("2026-08-20T09:00:00Z");
    expect(entries[0]!.round.clusters).toHaveLength(3);
    expect(entries[0]!.prose).toBe("Did a round.");
  });

  test("turns with no round block contribute nothing", () => {
    expect(foldRounds([{ reply: "just chatting" }])).toEqual([]);
  });
});

describe("openPullRequests", () => {
  test("only the newest round's live PRs, deduped", () => {
    const prs = openPullRequests(foldRounds([{ reply: FULL }]));
    expect(prs.map((c) => c.pr)).toEqual([41, 38]);
  });

  test("declined and failed clusters are not pull requests you have open", () => {
    const prs = openPullRequests(foldRounds([{ reply: round('{"summary":{},"clusters":[{"key":"a","file":"a","status":"declined","pr":3},{"key":"b","file":"b","status":"failed"}]}') }]));
    expect(prs).toEqual([]);
  });

  test("no rounds, no pull requests", () => {
    expect(openPullRequests([])).toEqual([]);
  });
});

describe("describeRound", () => {
  test("leads with what it opened", () => {
    expect(describeRound(parseRounds(FULL)[0]!)).toContain("opened 1 pull request");
  });

  test("a clean repo and a quiet round read differently", () => {
    expect(describeRound(parseRounds(round('{"summary":{"total":0},"clusters":[],"openPrs":0}'))[0]!)).toBe("clean — nothing to fix");
    expect(describeRound(parseRounds(round('{"summary":{"total":4},"clusters":[],"openPrs":0}'))[0]!)).toBe("nothing new to propose");
  });

  test("an error is the whole story", () => {
    expect(describeRound(parseRounds(round('{"error":"no push access","summary":{},"clusters":[]}'))[0]!)).toBe("no push access");
  });
});
