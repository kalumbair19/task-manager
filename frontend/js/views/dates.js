import { api } from "../api.js";
import { formatDate, priorityBadge, escapeHtml } from "../utils.js";

export async function renderDates(root) {
  root.innerHTML = `
    <div class="page-header">
      <div>
        <h1>Important Dates</h1>
        <p>Tasks due or starting in the next 60 days, plus anything overdue.</p>
      </div>
    </div>
    <div id="dates-body" class="loading">Loading dates…</div>
  `;

  const body = root.querySelector("#dates-body");
  let events;
  try {
    events = await api.importantDates();
  } catch (err) {
    body.innerHTML = `<div class="error-banner">${err.message}</div>`;
    return;
  }

  if (!events.length) {
    body.innerHTML = `<div class="panel"><div class="empty-state"><div class="big-icon">&#128197;</div>Nothing due or starting soon — you're all caught up.</div></div>`;
    return;
  }

  const overdue = events.filter((ev) => ev.overdue);
  const upcoming = events.filter((ev) => !ev.overdue);

  const groups = new Map();
  for (const ev of upcoming) {
    const d = new Date(ev.date + "T00:00:00");
    const key = d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ ...ev, _dateObj: d });
  }

  const eventRow = (ev, overdueFlag) => `
    <div class="date-event">
      <div>
        <div class="task-desc">${escapeHtml(ev.description)}</div>
        <div class="report-meta">
          ${ev.type === "due" ? "Due" : "Starts"} ${formatDate(ev.date)}
          &middot; ${escapeHtml(ev.assigned_to) || "Unassigned"}
        </div>
      </div>
      <div>${overdueFlag ? '<span class="badge overdue">OVERDUE</span>' : ""} ${priorityBadge(ev.priority)}</div>
    </div>`;

  const overdueSection = overdue.length
    ? `
    <div class="panel">
      <h2>Overdue</h2>
      ${overdue.map((ev) => eventRow(ev, true)).join("")}
    </div>`
    : "";

  const upcomingSection = upcoming.length
    ? `
    <div class="panel">
      ${Array.from(groups.entries())
        .map(([monthLabel, items]) => {
          items.sort((a, b) => a._dateObj - b._dateObj);
          return `
          <div class="date-group">
            <div class="date-group-heading">${monthLabel}</div>
            ${items.map((ev) => eventRow(ev, false)).join("")}
          </div>`;
        })
        .join("")}
    </div>`
    : "";

  body.innerHTML = overdueSection + upcomingSection;
}
