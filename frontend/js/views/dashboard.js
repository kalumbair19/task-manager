import { api } from "../api.js";
import { formatDate, statusBadge, priorityBadge } from "../utils.js";
import { navigate } from "../router.js";

const KPI_DEFS = [
  { key: "not_started", label: "Not Started", icon: "&#128204;", color: "c-blue" },
  { key: "in_progress", label: "In Progress", icon: "&#9203;", color: "c-amber" },
  { key: "on_hold", label: "On Hold", icon: "&#9208;", color: "c-purple" },
  { key: "complete", label: "Complete", icon: "&#9989;", color: "c-green" },
  { key: "cancelled", label: "Cancelled", icon: "&#10060;", color: "c-gray" },
];

export async function renderDashboard(root) {
  root.innerHTML = `
    <div class="page-header">
      <div>
        <h1>Dashboard</h1>
        <p>A live snapshot of everything on your plate.</p>
      </div>
      <button class="btn btn-primary" id="new-task-btn">+ New Task</button>
    </div>
    <div id="dashboard-body" class="loading">Loading KPIs…</div>
  `;

  root.querySelector("#new-task-btn").addEventListener("click", () => navigate("/tasks?new=1"));

  let data;
  try {
    data = await api.kpiSummary();
  } catch (err) {
    root.querySelector("#dashboard-body").innerHTML =
      `<div class="error-banner">${err.message}</div>`;
    return;
  }

  const body = root.querySelector("#dashboard-body");
  const { counts, total_active, overdue_count, due_soon_count, due_soon } = data;
  const maxCount = Math.max(1, ...Object.values(counts));

  body.innerHTML = `
    <div class="kpi-grid">
      ${KPI_DEFS.map(
        (d) => `
        <div class="kpi-card ${d.color}">
          <div class="kpi-icon">${d.icon}</div>
          <div class="kpi-value">${counts[d.key] ?? 0}</div>
          <div class="kpi-label">${d.label}</div>
        </div>`
      ).join("")}
      <div class="kpi-card c-red">
        <div class="kpi-icon">&#9888;&#65039;</div>
        <div class="kpi-value">${overdue_count}</div>
        <div class="kpi-label">Overdue</div>
      </div>
    </div>

    <div class="two-col">
      <div class="panel">
        <h2>Due in the Next 7 Days (${due_soon_count})</h2>
        ${
          due_soon.length === 0
            ? `<div class="empty-state"><div class="big-icon">&#127881;</div>Nothing due this week.</div>`
            : due_soon
                .map(
                  (t) => `
              <div class="date-event">
                <div>
                  <div class="task-desc">${t.description}</div>
                  <div class="report-meta">${t.assigned_to || "Unassigned"} &middot; Due ${formatDate(t.due_date)}</div>
                </div>
                <div>${statusBadge(t.status)} ${priorityBadge(t.priority)}</div>
              </div>`
                )
                .join("")
        }
      </div>

      <div class="panel">
        <h2>Status Breakdown</h2>
        ${KPI_DEFS.map((d) => {
          const value = counts[d.key] ?? 0;
          const pct = Math.round((value / maxCount) * 100);
          return `
            <div style="margin-bottom:14px;">
              <div style="display:flex; justify-content:space-between; font-size:0.82rem; font-weight:700; color:var(--navy); margin-bottom:4px;">
                <span>${d.label}</span><span>${value}</span>
              </div>
              <div style="background:#eef0f7; border-radius:8px; height:9px; overflow:hidden;">
                <div style="width:${pct}%; height:100%; background:var(--accent); border-radius:8px;"></div>
              </div>
            </div>`;
        }).join("")}
        <p class="small-muted" style="margin-top:10px;">${total_active} active task${total_active === 1 ? "" : "s"} total.</p>
      </div>
    </div>
  `;
}
