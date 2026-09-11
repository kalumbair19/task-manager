import { api } from "../api.js";
import { formatDate, statusBadge, priorityBadge, escapeHtml } from "../utils.js";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export async function renderReport(root) {
  const now = new Date();

  root.innerHTML = `
    <div class="page-header no-print">
      <div>
        <h1>Monthly Status Report</h1>
        <p>Generate a shareable summary of the month's activity.</p>
      </div>
      <button class="btn btn-secondary" id="print-btn">&#128424;&#65039; Print / Save as PDF</button>
    </div>

    <div class="panel no-print">
      <div class="toolbar">
        <select id="month-select"></select>
        <select id="year-select"></select>
        <button class="btn btn-primary" id="generate-btn">Generate Report</button>
      </div>
    </div>

    <div id="report-output"></div>
  `;

  const monthSelect = root.querySelector("#month-select");
  const yearSelect = root.querySelector("#year-select");

  monthSelect.innerHTML = MONTH_NAMES.map(
    (m, i) => `<option value="${i + 1}" ${i + 1 === now.getMonth() + 1 ? "selected" : ""}>${m}</option>`
  ).join("");

  const currentYear = now.getFullYear();
  const years = [currentYear - 1, currentYear, currentYear + 1];
  yearSelect.innerHTML = years
    .map((y) => `<option value="${y}" ${y === currentYear ? "selected" : ""}>${y}</option>`)
    .join("");

  root.querySelector("#print-btn").addEventListener("click", () => window.print());

  const generate = async () => {
    const output = root.querySelector("#report-output");
    output.innerHTML = `<div class="loading">Building report…</div>`;
    try {
      const data = await api.monthlyReport(yearSelect.value, monthSelect.value);
      output.innerHTML = renderReportHtml(data);
    } catch (err) {
      output.innerHTML = `<div class="error-banner">${err.message}</div>`;
    }
  };

  root.querySelector("#generate-btn").addEventListener("click", generate);
  await generate();
}

function taskLine(t, dateField) {
  return `
    <div class="report-item">
      <div class="task-desc">${escapeHtml(t.description)}</div>
      <div class="report-meta">
        ${statusBadge(t.status)} ${priorityBadge(t.priority)}
        &middot; ${escapeHtml(t.assigned_to) || "Unassigned"}
        ${dateField && t[dateField] ? `&middot; ${formatDate(t[dateField])}` : ""}
      </div>
      ${t.notes ? `<div class="task-notes">${escapeHtml(t.notes)}</div>` : ""}
    </div>
  `;
}

function section(title, tasks, dateField, emptyText) {
  return `
    <div class="report-section">
      <h3>${title} (${tasks.length})</h3>
      ${tasks.length ? tasks.map((t) => taskLine(t, dateField)).join("") : `<p class="small-muted">${emptyText}</p>`}
    </div>
  `;
}

function renderReportHtml(data) {
  const { period, summary } = data;
  return `
    <div class="panel">
      <div style="margin-bottom:18px;">
        <div class="small-muted" style="text-transform:uppercase; letter-spacing:0.05em; font-weight:700;">Monthly Status Report</div>
        <h1 style="margin:2px 0 0; color:var(--navy);">${period.label}</h1>
      </div>

      <div class="kpi-grid" style="margin-bottom:26px;">
        <div class="kpi-card c-green"><div class="kpi-value">${summary.completed_count}</div><div class="kpi-label">Completed</div></div>
        <div class="kpi-card c-blue"><div class="kpi-value">${summary.started_count}</div><div class="kpi-label">Started</div></div>
        <div class="kpi-card c-amber"><div class="kpi-value">${summary.in_progress_count}</div><div class="kpi-label">In Progress</div></div>
        <div class="kpi-card c-purple"><div class="kpi-value">${summary.due_this_month_count}</div><div class="kpi-label">Due This Month</div></div>
        <div class="kpi-card c-red"><div class="kpi-value">${summary.overdue_count}</div><div class="kpi-label">Still Overdue</div></div>
      </div>

      ${section("Completed This Month", data.completed_this_month, "date_completed", "Nothing completed this month.")}
      ${section("Started This Month", data.started_this_month, "start_date", "Nothing started this month.")}
      ${section("Currently In Progress", data.in_progress, "due_date", "Nothing in progress right now.")}
      ${section("Due This Month", data.due_this_month, "due_date", "Nothing due this month.")}
      ${section("Still Overdue (from prior months)", data.overdue_still_open, "due_date", "Nothing overdue. Great work.")}
    </div>
  `;
}
