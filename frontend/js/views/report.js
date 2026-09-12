import { api } from "../api.js";
import { escapeHtml } from "../utils.js";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function toIsoDate(d) {
  return d.toISOString().slice(0, 10);
}

function fromIsoDate(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export async function renderReport(root) {
  const today = new Date();
  const state = {
    type: "weekly", // "weekly" | "monthly"
    weekAnchor: toIsoDate(today),
    year: today.getFullYear(),
    month: today.getMonth() + 1,
    mitigatingAction: "",
  };

  root.innerHTML = `
    <div class="page-header no-print">
      <div>
        <h1>Status Report</h1>
        <p>Generate the Weekly or Monthly PMS-406 sUSV status report.</p>
      </div>
      <button class="btn btn-secondary" id="print-btn">&#128424;&#65039; Print / Save as PDF</button>
    </div>

    <div class="panel no-print">
      <div class="report-type-toggle">
        <button class="toggle-btn active" data-type="weekly">Weekly Report</button>
        <button class="toggle-btn" data-type="monthly">Monthly Report</button>
      </div>
      <div class="toolbar" id="period-controls"></div>
    </div>

    <div id="report-output"></div>
  `;

  root.querySelector("#print-btn").addEventListener("click", () => window.print());

  const toggleBtns = root.querySelectorAll(".toggle-btn");
  toggleBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      toggleBtns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      state.type = btn.dataset.type;
      renderControls();
      generate();
    });
  });

  function renderControls() {
    const controls = root.querySelector("#period-controls");
    if (state.type === "weekly") {
      controls.innerHTML = `
        <button class="btn btn-secondary" id="week-prev">&larr; Prev Week</button>
        <input type="date" id="week-date" value="${state.weekAnchor}" />
        <button class="btn btn-secondary" id="week-next">Next Week &rarr;</button>
        <button class="btn btn-primary" id="generate-btn">Generate Report</button>
      `;
      controls.querySelector("#week-prev").addEventListener("click", () => {
        const d = fromIsoDate(state.weekAnchor);
        d.setDate(d.getDate() - 7);
        state.weekAnchor = toIsoDate(d);
        controls.querySelector("#week-date").value = state.weekAnchor;
        generate();
      });
      controls.querySelector("#week-next").addEventListener("click", () => {
        const d = fromIsoDate(state.weekAnchor);
        d.setDate(d.getDate() + 7);
        state.weekAnchor = toIsoDate(d);
        controls.querySelector("#week-date").value = state.weekAnchor;
        generate();
      });
      controls.querySelector("#week-date").addEventListener("change", (e) => {
        state.weekAnchor = e.target.value;
        generate();
      });
      controls.querySelector("#generate-btn").addEventListener("click", generate);
    } else {
      controls.innerHTML = `
        <select id="month-select"></select>
        <select id="year-select"></select>
        <button class="btn btn-primary" id="generate-btn">Generate Report</button>
      `;
      const monthSelect = controls.querySelector("#month-select");
      const yearSelect = controls.querySelector("#year-select");
      monthSelect.innerHTML = MONTH_NAMES.map(
        (m, i) => `<option value="${i + 1}" ${i + 1 === state.month ? "selected" : ""}>${m}</option>`
      ).join("");
      const currentYear = today.getFullYear();
      const years = [currentYear - 1, currentYear, currentYear + 1];
      yearSelect.innerHTML = years
        .map((y) => `<option value="${y}" ${y === state.year ? "selected" : ""}>${y}</option>`)
        .join("");
      monthSelect.addEventListener("change", (e) => {
        state.month = Number(e.target.value);
        generate();
      });
      yearSelect.addEventListener("change", (e) => {
        state.year = Number(e.target.value);
        generate();
      });
      controls.querySelector("#generate-btn").addEventListener("click", generate);
    }
  }

  async function generate() {
    const output = root.querySelector("#report-output");
    output.innerHTML = `<div class="loading">Building report…</div>`;
    try {
      const data =
        state.type === "weekly"
          ? await api.weeklyReport(state.weekAnchor)
          : await api.monthlyReport(state.year, state.month);
      state.mitigatingAction = data.mitigating_action_default;
      output.innerHTML = renderReportHtml(data, state.type);
      wireEditableFields(output, data, state.type);
    } catch (err) {
      output.innerHTML = `<div class="error-banner">${escapeHtml(err.message)}</div>`;
    }
  }

  function wireEditableFields(output, data, reportType) {
    const mitigatingBox = output.querySelector("#mitigating-action-input");
    if (mitigatingBox) {
      mitigatingBox.addEventListener("input", (e) => {
        output.querySelector("#mitigating-action-print").textContent = e.target.value;
      });
    }

    const prevInput = output.querySelector("#deliverables-previous-input");
    if (prevInput) {
      prevInput.addEventListener("change", async (e) => {
        const value = Math.max(0, parseInt(e.target.value, 10) || 0);
        e.target.value = value;
        try {
          await api.setDeliverableTally(reportType, value);
          const cumulative = value + data.deliverables_current;
          output.querySelector("#deliverables-cumulative").textContent = cumulative;
        } catch (err) {
          // non-fatal -- the number just won't persist
        }
      });
    }
  }

  renderControls();
  await generate();
}

function listBlock(lines) {
  return lines.map((line) => `<div class="report-line">${escapeHtml(line)}</div>`).join("");
}

function deliverablesTable(rows) {
  if (!rows.length) {
    return `<p class="small-muted">No deliverables recorded for this period.</p>`;
  }
  return `
    <table class="report-table">
      <thead>
        <tr><th>Date</th><th>Deliverable Description</th><th>Delivered To</th></tr>
      </thead>
      <tbody>
        ${rows
          .map(
            (r) => `
          <tr>
            <td>${escapeHtml(r.date)}</td>
            <td>${escapeHtml(r.description)}</td>
            <td>${escapeHtml(r.recipient)}</td>
          </tr>`
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function renderReportHtml(data, reportType) {
  const title = reportType === "weekly" ? "Weekly Status Report" : "Monthly Status Report";

  return `
    <div class="panel report-doc">
      <div class="report-doc-header">
        <div class="small-muted report-doc-kicker">${title}</div>
        <h1 class="report-doc-title">${escapeHtml(data.report_period)}</h1>
      </div>

      <div class="report-meta-grid">
        <div><span class="report-meta-label">Date of Submission:</span> ${escapeHtml(data.date_submission)}</div>
        <div><span class="report-meta-label">Reporting Period:</span> ${escapeHtml(data.report_period)}</div>
        <div><span class="report-meta-label">Start Date:</span> ${escapeHtml(data.start_date)}</div>
        <div><span class="report-meta-label">Completion Date:</span> ${escapeHtml(data.completion_date)}</div>
      </div>

      <div class="report-section">
        <h3>1. Description of the Work Accomplished</h3>
        ${listBlock(data.tasks)}
      </div>

      <div class="report-section">
        <h3>2. Summary of Meetings Attended</h3>
        <p class="small-muted">The following meetings were attended during the reporting period:</p>
        ${listBlock(data.meetings_attended)}
        <p class="report-subheading">Meeting Highlights</p>
        <div class="report-indent">${listBlock(data.meetings_summary)}</div>
      </div>

      <div class="report-section">
        <h3>3. Summary of Current Period Travel</h3>
        ${listBlock(data.current_travel)}
      </div>

      <div class="report-section">
        <h3>4. List of Deliverables Provided</h3>
        <div class="deliverables-counts no-print">
          <label>Previously Reported:
            <input type="number" min="0" id="deliverables-previous-input" value="${data.deliverables_previous}" />
          </label>
          <span>This Reporting Period: <strong>${data.deliverables_current}</strong></span>
          <span>Cumulative: <strong id="deliverables-cumulative">${data.deliverables_cumulative}</strong></span>
        </div>
        <div class="deliverables-counts print-only">
          <span>Previously Reported: <strong>${data.deliverables_previous}</strong></span>
          <span>This Reporting Period: <strong>${data.deliverables_current}</strong></span>
          <span>Cumulative: <strong>${data.deliverables_cumulative}</strong></span>
        </div>
        ${deliverablesTable(data.deliverables)}
      </div>

      <div class="report-section">
        <h3>5. Problem Areas Encountered and Anticipated</h3>
        <p class="report-subheading">Encountered the Following:</p>
        ${listBlock(data.problem_areas)}
        <p class="report-subheading">Mitigating action(s) taken:</p>
        <textarea class="no-print report-textarea" id="mitigating-action-input" rows="2">${escapeHtml(
          data.mitigating_action_default
        )}</textarea>
        <div class="report-line print-only" id="mitigating-action-print">${escapeHtml(
          data.mitigating_action_default
        )}</div>
      </div>

      <div class="report-section">
        <h3>6. Work Planned for the Next Reporting Period</h3>
        ${listBlock(data.work_planned)}
      </div>

      <div class="report-section">
        <h3>7. Travel Planned During the Next Reporting Period</h3>
        ${listBlock(data.future_travel)}
      </div>
    </div>
  `;
}
