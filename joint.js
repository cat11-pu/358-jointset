// joint.js：成员登记与票
export function joinOf(members, name, side) {
  const next = members.map(function (row) { return row.slice(); });
  next.push([name, side, "wait"]);
  next.sort(function (x, y) {
    if (x[0] < y[0]) return -1;
    if (x[0] > y[0]) return 1;
    return 0;
  });
  return next;
}

export function castOf(members, name, yes) {
  const vote = yes ? "yes" : "no";
  return members.map(function (row) {
    return row[0] === name ? [row[0], row[1], vote] : row.slice();
  });
}
