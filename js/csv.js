const cell = (v) => {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // neutralise spreadsheet formula injection
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCsv({ habits, logs }) {
  const names = new Map(habits.map((h) => [h.id, h.name]));
  const rows = Object.values(logs)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((l) => [l.date, names.get(l.habitId) ?? '(deleted)', l.status, l.current ?? '', l.target ?? '', l.resistance ?? '', (l.tags || []).join('; ')]);
  return [['date', 'habit', 'status', 'current', 'target', 'resistance', 'tags'], ...rows].map((r) => r.map(cell).join(',')).join('\n');
}

export function download(filename, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
