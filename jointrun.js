// jointrun.js：按处理预算处理事件并留账，收尾不限预算补齐
import { joinOf, castOf } from "./joint.js";

const DEFAULT_CODES = {
  bad_name_code: "E_BAD_NAME",
  bad_side_code: "E_BAD_SIDE",
  dup_member_code: "E_DUP_MEMBER",
  no_member_code: "E_NO_MEMBER",
  dup_vote_code: "E_DUP_VOTE",
  empty_code: "E_EMPTY",
  event_error_code: "E_BAD_EVENT"
};

function codeOf(spec, key) {
  const codes = spec && spec.codes && typeof spec.codes === "object" ? spec.codes : spec;
  return (codes && codes[key]) || DEFAULT_CODES[key];
}

function fail(spec, key, message) {
  const error = new Error(message);
  error.code = codeOf(spec, key);
  throw error;
}

// 把事件规整成账上的紧凑元组：declare/vote/decide，其它一律 null
function tupleOf(event) {
  if (!event || typeof event !== "object") return null;
  if (event.kind === "declare") return ["declare", event.name, event.side];
  if (event.kind === "vote") return ["vote", event.name, event.yes ? 1 : 0];
  if (event.kind === "decide") return ["decide"];
  return null;
}

// 账上元组还原成事件对象
function eventOf(item) {
  if (Array.isArray(item)) {
    if (item[0] === "declare") return { kind: "declare", name: item[1], side: item[2] };
    if (item[0] === "vote") return { kind: "vote", name: item[1], yes: item[2] === 1 };
    if (item[0] === "decide") return { kind: "decide" };
    return null;
  }
  return item && typeof item === "object" ? item : null;
}

function signatureOf(event) {
  return JSON.stringify(tupleOf(event) || event);
}

// 先结构，再名字/集合，最后成员表语义
function validate(event, members, spec) {
  if (!event || typeof event !== "object") {
    fail(spec, "event_error_code", "事件不是对象");
  }
  if (event.kind === "declare") {
    if (typeof event.name !== "string" || event.name.length === 0) {
      fail(spec, "bad_name_code", "成员名为空");
    }
    if (event.side !== "old" && event.side !== "new") {
      fail(spec, "bad_side_code", "集合只能是 old 或 new");
    }
    if (members.some(function (row) { return row[0] === event.name; })) {
      fail(spec, "dup_member_code", "成员已登记：" + event.name);
    }
  } else if (event.kind === "vote") {
    if (typeof event.name !== "string" || event.name.length === 0) {
      fail(spec, "bad_name_code", "成员名为空");
    }
    const member = members.filter(function (row) { return row[0] === event.name; })[0];
    if (!member) {
      fail(spec, "no_member_code", "成员没登记：" + event.name);
    }
    if (member[2] !== "wait") {
      fail(spec, "dup_vote_code", "成员已投过：" + event.name);
    }
  } else if (event.kind === "decide") {
    const old = members.filter(function (row) { return row[1] === "old"; });
    const fresh = members.filter(function (row) { return row[1] === "new"; });
    if (old.length === 0 || fresh.length === 0) {
      fail(spec, "empty_code", "两套集合都得有人才能表决");
    }
  } else {
    fail(spec, "event_error_code", "不认识的事件类型");
  }
}

function tally(members, side) {
  const group = members.filter(function (row) { return row[1] === side; });
  const yes = group.filter(function (row) { return row[2] === "yes"; }).length;
  const pass = yes * 2 > group.length;
  return { yes: yes, pass: pass };
}

function cloneState(state) {
  const src = state || {};
  return {
    members: (src.members || []).map(function (row) { return [row[0], row[1], row[2]]; }),
    records: (src.records || []).map(function (row) { return [row[0], row[1], row[2]]; }),
    ledger: (src.ledger || []).slice(),
    applied: (src.applied || []).slice()
  };
}

// 流式处理：每条（未应用的）事件花一次预算；预算耗尽后连着压账
function runStream(entries, start, budget, spec) {
  const members = start.members;
  const records = start.records;
  const ledger = start.ledger;
  const applied = start.applied;
  const seen = Object.create(null);
  let spent = 0;
  let served = 0;
  let i = 0;

  for (; i < entries.length; i += 1) {
    const event = eventOf(entries[i]);
    const signature = signatureOf(event);
    const ordinal = (seen[signature] || 0) + 1;
    seen[signature] = ordinal;
    const key = signature + "#" + ordinal;

    // 已应用过的（重放/收尾后补齐）直接跳过，不花预算也不进账
    if (applied.indexOf(key) !== -1) {
      continue;
    }

    if (budget !== null && spent >= budget) {
      break;
    }
    spent += 1;

    validate(event, members, spec);

    if (event.kind === "declare") {
      const updated = joinOf(members, event.name, event.side);
      while (members.length) { members.pop(); }
      updated.forEach(function (row) { members.push(row); });
    } else if (event.kind === "vote") {
      const updated = castOf(members, event.name, event.yes);
      while (members.length) { members.pop(); }
      updated.forEach(function (row) { members.push(row); });
    } else {
      const oldVote = tally(members, "old");
      const newVote = tally(members, "new");
      records.push([oldVote.pass && newVote.pass ? "commit" : "abort",
                    oldVote.yes, newVote.yes]);
    }
    applied.push(key);
    served += 1;
  }

  // 预算用尽后没处理的连着载压账
  for (; i < entries.length; i += 1) {
    const event = eventOf(entries[i]);
    const signature = signatureOf(event);
    const ordinal = (seen[signature] || 0) + 1;
    seen[signature] = ordinal;
    const key = signature + "#" + ordinal;
    if (applied.indexOf(key) !== -1) {
      continue;
    }
    ledger.push(tupleOf(event) || entries[i]);
  }

  return { served: served, spent: spent };
}

export function step(spec) {
  const state = cloneState(spec.state);
  const events = (spec.events || []).slice();
  const budget = Number.isFinite(spec.budget) ? spec.budget : null;
  const before = state.ledger.length;

  const result = runStream(events, state, budget, spec);

  return {
    state: state,
    served: result.served,
    ledger_before: state.ledger.length,
    ledger: state.ledger.slice(),
    judged: result.served,
    judged_bound: events.length
  };
}

export function close(spec) {
  const state = cloneState(spec.state);
  const pending = state.ledger;
  const entries = pending.slice();
  const result = runStream(entries, state, null, spec);
  while (pending.length) { pending.pop(); }
  return { state: state, catchup: result.served };
}
