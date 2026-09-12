import { api } from "../api.js";
import { formatDate, statusBadge, priorityBadge, STATUS_OPTIONS, debounce } from "../utils.js";
import { openTaskModal } from "../components/taskModal.js";
import { confirmAction } from "../components/confirmModal.js";

let currentFilters = { status: "", priority: "", search: "" };

export async function renderTasks(root, params) {
  root.innerHTML = `
    <div class="page-header">
      <div>
        <h1>Tasks</h1>
        <p>All active tasks — add, edit, and track status in one place.</p>
      </div>
      <button class="btn btn-primary" id="new-task-btn">+ New Task</button>
    </div>

    <div class="panel">
      <div class="toolbar">
        <input type="search" id="search-input" placeholder="Search description, notes, assignee…" style="min-width:240px;" />
        <select id="status-filter">
          <option value="">All Statuses</option>
          ${STATUS_OPTIONS.map((s) => `<option value="${s}">${s}</option>`).join("")}
        </select>
        <select id="priority-filter">
          <option value="">All Priorities</option>
          <option value="Low">Low</option>
          <option value="Normal">Normal</option>
          <option value="High">High</option>
          <option value="Urgent">Urgent</option>
        </select>
      </div>
      <div id="tasks-table" class="table-wrap"><div class="loading">Loading tasks…</div></div>
    </div>
  `;

  const searchInput = root.querySelector("#search-input");
  const statusFilter = root.querySelector("#status-filter");
  const priorityFilter = root.querySelector("#priority-filter");
  const tableWrap = root.querySelector("#tasks-table");

  const load = async () => {
    tableWrap.innerHTML = `<div class="loading">Loading tasks…</div>`;
    const query = {};
    if (currentFilters.status) query.status = currentFilters.status;
    if (currentFilters.priority) query.priority = currentFilters.priority;
    if (currentFilters.search) query.search = currentFilters.search;
    query.ordering = "due_date";

    try {
      const data = await api.listTasks(query);
      renderTable(tableWrap, data.results ?? data, load);
    } catch (err) {
      tableWrap.innerHTML = `<div class="error-banner">${err.message}</div>`;
    }
  };

  searchInput.addEventListener(
    "input",
    debounce(() => {
      currentFilters.search = searchInput.value.trim();
      load();
    }, 350)
  );
  statusFilter.addEventListener("change", () => {
    currentFilters.status = statusFilter.value;
    load();
  });
  priorityFilter.addEventListener("change", () => {
    currentFilters.priority = priorityFilter.value;
    load();
  });

  root.querySelector("#new-task-btn").addEventListener("click", () => {
    openTaskModal(null, { onSaved: load });
  });

  await load();

  if (params.get("new") === "1") {
    openTaskModal(null, { onSaved: load });
  }
}

function renderTable(container, tasks, reload) {
  if (!tasks.length) {
    container.innerHTML = `<div class="empty-state"><div class="big-icon">&#128203;</div>No tasks match these filters.</div>`;
    return;
  }

  container.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Task</th>
          <th>Priority</th>
          <th>Assigned To</th>
          <th>Start</th>
          <th>Due</th>
          <th>Status</th>
          <th>Notes</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        ${tasks
          .map(
            (t) => `
          <tr data-id="${t.id}">
            <td>${t.task_no ?? "—"}</td>
            <td><div class="task-desc">${t.description}</div></td>
            <td>${priorityBadge(t.priority)}</td>
            <td>${t.assigned_to || "—"}</td>
            <td>${formatDate(t.start_date)}</td>
            <td>${formatDate(t.due_date)} ${t.is_overdue ? '<span class="badge overdue">OVERDUE</span>' : ""}</td>
            <td>
              <select class="status-select" data-id="${t.id}">
                ${STATUS_OPTIONS.map(
                  (s) => `<option value="${s}" ${t.status === s ? "selected" : ""}>${s}</option>`
                ).join("")}
              </select>
            </td>
            <td><div class="task-notes-col">${t.notes || "—"}</div></td>
            <td>
              <div class="row-actions">
                <button class="btn btn-secondary btn-sm edit-btn" data-id="${t.id}">Edit</button>
                <button class="btn btn-secondary btn-sm archive-btn" data-id="${t.id}">Archive</button>
                <button class="btn btn-danger btn-sm delete-btn" data-id="${t.id}">Delete</button>
              </div>
            </td>
          </tr>`
          )
          .join("")}
      </tbody>
    </table>
  `;

  const findTask = (id) => tasks.find((t) => String(t.id) === String(id));

  container.querySelectorAll(".status-select").forEach((sel) => {
    sel.addEventListener("change", async () => {
      const id = sel.dataset.id;
      try {
        await api.updateTask(id, { status: sel.value });
        reload();
      } catch (err) {
        alert(err.message);
      }
    });
  });

  container.querySelectorAll(".edit-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      openTaskModal(findTask(btn.dataset.id), { onSaved: reload });
    });
  });

  container.querySelectorAll(".archive-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const task = findTask(btn.dataset.id);
      const ok = await confirmAction({
        title: "Archive this task?",
        message: `"${task?.description || "This task"}" will move to the Archive. You can restore it from there at any time.`,
        confirmLabel: "Archive Task",
      });
      if (!ok) return;
      try {
        await api.archiveTask(btn.dataset.id);
        reload();
      } catch (err) {
        alert(err.message);
      }
    });
  });

  container.querySelectorAll(".delete-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const task = findTask(btn.dataset.id);
      const ok = await confirmAction({
        title: "Delete this task?",
        message: `"${task?.description || "This task"}" will be permanently deleted and cannot be recovered.`,
        confirmLabel: "Delete Task",
        danger: true,
      });
      if (!ok) return;
      try {
        await api.deleteTask(btn.dataset.id);
        reload();
      } catch (err) {
        alert(err.message);
      }
    });
  });
}
