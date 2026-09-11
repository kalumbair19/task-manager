import { api } from "../api.js";
import { formatDate, priorityBadge, escapeHtml } from "../utils.js";

export async function renderDates(root) {
  root.innerHTML = `
    <div class="page-header">
      <div>
        <h1>Important Dates</h1>
        <p>Every task's start and due date, grouped by month.</p>
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
    body.innerHTML = `<div class="panel"><div class="empty-state"><div class="big-icon">&#128197;</div>No dated tasks yet.</div></div>`;
    return;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const groups = new Map();
  for (const ev of events) {
    const d = new Date(ev.date + "T00:00:00");
    const key = d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ ...ev, _dateObj: d });
  }

  body.innerHTML = `
    <div class="panel">
      ${Array.from(groups.entries())
        .map(([monthLabel, items]) => {
          items.sort((a, b) => a._dateObj - b._dateObj);
          return `
          <div class="date-group">
            <div class="date-group-heading">${monthLabel}</div>
            ${items
              .map((ev) => {
                const overdue = ev.type === "due" && ev._dateObj < today && !["Complete", "Cancelled"].includes(ev.status);
                return `
                <div class="date-event">
                  <div>
                    <div class="task-desc">${escapeHtml(ev.description)}</div>
                    <div class="report-meta">
                      ${ev.type === "due" ? "Due" : "Starts"} ${formatDate(ev.date)}
                      &middot; ${escapeHtml(ev.assigned_to) || "Unassigned"}
                    </div>
                  </div>
                  <div>${overdue ? '<span class="badge overdue">OVERDUE</span>' : ""} ${priorityBadge(ev.priority)}</div>
                </div>`;
              })
              .join("")}
          </div>`;
        })
        .join("")}
    </div>
  `;
}
