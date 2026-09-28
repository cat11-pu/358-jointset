// joint.js：成员登记与投票
export function joinOf(members, name, side) {
  const next = members.map(function (row) { return [row[0], row[1], row[2]]; });
  next.push([name, side, "wait"]);
  next.sort(function (a, b) { return a[0] < b[0] ? -1 : (a[0] > b[0] ? 1 : 0); });
  return next;
}

export function castOf(members, name, yes) {
  return members.map(function (row) {
    return row[0] === name ? [row[0], row[1], yes ? "yes" : "no"] : [row[0], row[1], row[2]];
  });
}
