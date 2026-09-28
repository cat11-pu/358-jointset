// jointrun.js：按处理预算处理并留账
import { joinOf, castOf } from "./joint.js";

function codesOf(spec) {
  const src = spec || {};
  return {
    badEvent: src.event_error_code || "E_BAD_EVENT",
    badName: src.bad_name_code || "E_BAD_NAME",
    badSide: src.bad_side_code || "E_BAD_SIDE",
    dupMember: src.dup_member_code || "E_DUP_MEMBER",
    noMember: src.no_member_code || "E_NO_MEMBER",
    dupVote: src.dup_vote_code || "E_DUP_VOTE",
    empty: src.empty_code || "E_EMPTY"
  };
}

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function normalize(event) {
  if (!event || typeof event !== "object") return [""];
  if (event.kind === "declare") return ["declare", event.name, event.side];
  if (event.kind === "vote") return ["vote", event.name, event.yes ? 1 : 0];
  if (event.kind === "decide") return ["decide"];
  return [String(event.kind)];
}

function keyOf(event, req) {
  if (event && typeof event === "object" && event.id !== undefined) {
    return "id:" + event.id;
  }
  return "json:" + JSON.stringify(req);
}

function copyState(state) {
  const src = state || {};
  return {
    members: (src.members || []).map(function (row) { return row.slice(); }),
    records: (src.records || []).map(function (row) { return row.slice(); }),
    ledger: (src.ledger || []).map(function (entry) {
      if (Array.isArray(entry)) {
        return { key: "json:" + JSON.stringify(entry), req: entry.slice() };
      }
      return { key: entry.key, req: entry.req.slice() };
    }),
    applied: (src.applied || []).slice()
  };
}

function applyReq(state, req, codes) {
  const kind = req && req[0];
  if (kind === "declare") {
    const name = req[1];
    const side = req[2];
    if (typeof name !== "string" || name === "") fail(codes.badName);
    if (side !== "old" && side !== "new") fail(codes.badSide);
    if (state.members.some(function (row) { return row[0] === name; })) fail(codes.dupMember);
    state.members = joinOf(state.members, name, side);
    return;
  }
  if (kind === "vote") {
    const name = req[1];
    if (typeof name !== "string" || name === "") fail(codes.badName);
    for (const row of state.members) {
      if (row[0] === name) {
        if (row[2] !== "wait") fail(codes.dupVote);
        state.members = castOf(state.members, name, !!req[2]);
        return;
      }
    }
    fail(codes.noMember);
    return;
  }
  if (kind === "decide") {
    const oldOnes = state.members.filter(function (row) { return row[1] === "old"; });
    const newOnes = state.members.filter(function (row) { return row[1] === "new"; });
    if (oldOnes.length === 0 || newOnes.length === 0) fail(codes.empty);
    const oldYes = oldOnes.filter(function (row) { return row[2] === "yes"; }).length;
    const newYes = newOnes.filter(function (row) { return row[2] === "yes"; }).length;
    const pass = oldYes * 2 > oldOnes.length && newYes * 2 > newOnes.length;
    state.records = state.records.concat([[pass ? "commit" : "abort", oldYes, newYes]]);
    return;
  }
  fail(codes.badEvent);
}

export function step(spec) {
  const codes = codesOf(spec);
  const budgetStart = spec && typeof spec.budget === "number" ? spec.budget : 0;
  let budget = budgetStart;
  const state = copyState(spec && spec.state);
  const applied = new Set(state.applied);
  const pending = [];
  let served = 0;

  for (const entry of state.ledger) {
    if (budget > 0) {
      applyReq(state, entry.req, codes);
      applied.add(entry.key);
      budget -= 1;
      served += 1;
    } else {
      pending.push(entry);
    }
  }
  const events = (spec && spec.events) || [];
  for (const event of events) {
    const req = normalize(event);
    const key = keyOf(event, req);
    if (applied.has(key)) continue;
    if (budget > 0) {
      applyReq(state, req, codes);
      applied.add(key);
      budget -= 1;
      served += 1;
    } else {
      pending.push({ key: key, req: req });
    }
  }
  state.applied = Array.from(applied);
  state.ledger = pending;
  return {
    state: state,
    served: served,
    ledger_before: pending.length,
    ledger: pending.map(function (entry) { return entry.req.slice(); }),
    judged: served,
    judged_bound: budgetStart
  };
}

export function close(spec) {
  const codes = codesOf(spec);
  const state = copyState(spec && spec.state);
  const applied = new Set(state.applied);
  let catchup = 0;
  for (const entry of state.ledger) {
    applyReq(state, entry.req, codes);
    applied.add(entry.key);
    catchup += 1;
  }
  state.applied = Array.from(applied);
  state.ledger = [];
  return { state: state, catchup: catchup };
}
