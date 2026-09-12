import { api } from "../api.js";
import { formatDate, statusBadge, priorityBadge, debounce } from "../utils.js";
import { confirmAction } from "../components/confirmModal.js";

export async function renderArchive(root) {
  root.innerHTML = `
    <div class="page-header">
      <div>
        <h1>Archive</h1>
        <p>Completed and historical tasks, kept for reference.</p>
      </div>
    </div>
    <div class="panel">
      <div class="toolbar">
        <input type="search" id="search-input" placeholder="Search archived tasks…" style="min-width:260px;" />
      </div>
      <div id="archive-table" class="table-wrap"><div class="loading">Loading archive…</div></div>
    </div>
  `;

  const searchInput = root.querySelector("#search-input");
  const tableWrap = root.querySelector("#archive-table");

  const load = async () => {
    tableWrap.innerHTML = `<div class="loading">Loading archive…</div>`;
    const query = { is_archived: "true", ordering: "-due_date" };
    const term = searchInput.value.trim();
    if (term) query.search = term;
    try {
      const data = await api.listTasks(query);
      renderTable(tableWrap, data.results ?? data, load);
    } catch (err) {
      tableWrap.innerHTML = `<div class="error-banner">${err.message}</div>`;
    }
  };

  searchInput.addEventListener("input", debounce(load, 350));
  await load();
}

function renderTable(container, tasks, reload) {
  if (!tasks.length) {
    container.innerHTML = `<div class="empty-state"><div class="big-icon">&#128451;</div>No archived tasks yet.</div>`;
    return;
  }

  container.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>#</th><th>Task</th><th>Priority</th><th>Assigned To</th>
          <th>Completed</th><th>Status</th><th>Notes</th><th></th>
        </tr>
      </thead>
      <tbody>
        ${tasks
          .map(
            (t) => `
          <tr>
            <td>${t.task_no ?? "—"}</td>
            <td><div class="task-desc">${t.description}</div></td>
            <td>${priorityBadge(t.priority)}</td>
            <td>${t.assigned_to || "—"}</td>
            <td>${formatDate(t.date_completed)}</td>
            <td>${statusBadge(t.status)}</td>
            <td><div class="task-notes-col">${t.notes || "—"}</div></td>
            <td>
              <div class="row-actions">
                <button class="btn btn-secondary btn-sm unarchive-btn" data-id="${t.id}">Restore</button>
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

  container.querySelectorAll(".unarchive-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const task = findTask(btn.dataset.id);
      const ok = await confirmAction({
        title: "Restore this task?",
        message: `"${task?.description || "This task"}" will move back to your active Tasks list.`,
        confirmLabel: "Restore Task",
      });
      if (!ok) return;
      try {
        await api.unarchiveTask(btn.dataset.id);
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
