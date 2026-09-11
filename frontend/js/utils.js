export function slugify(value) {
  return (value || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export function formatDate(value) {
  if (!value) return "—";
  const d = new Date(value + "T00:00:00");
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function formatMonthDay(value) {
  if (!value) return "—";
  const d = new Date(value + "T00:00:00");
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function escapeHtml(str) {
  return (str ?? "").toString()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function statusBadge(status, extra = "") {
  const cls = `status-${slugify(status)}`;
  return `<span class="badge ${cls} ${extra}">${escapeHtml(status)}</span>`;
}

export function priorityBadge(priority) {
  const cls = `priority-${slugify(priority)}`;
  return `<span class="badge ${cls}">${escapeHtml(priority)}</span>`;
}

export const STATUS_OPTIONS = [
  "Not Started",
  "In Progress",
  "On Hold",
  "Complete",
  "Cancelled",
  "Weekly Reports",
  "Upcoming Travel",
  "Meetings Attended",
];

export const PRIORITY_OPTIONS = ["Low", "Normal", "High", "Urgent"];

export function debounce(fn, wait = 300) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}
