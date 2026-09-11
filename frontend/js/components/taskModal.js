import { STATUS_OPTIONS, PRIORITY_OPTIONS, escapeHtml } from "../utils.js";
import { api } from "../api.js";

export function openTaskModal(task, { onSaved } = {}) {
  const isEdit = !!task;
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML = `
    <div class="modal">
      <h2>${isEdit ? "Edit Task" : "New Task"}</h2>
      <div id="modal-error"></div>
      <form id="task-form">
        <div class="field">
          <label for="description">Task Description</label>
          <textarea id="description" name="description" rows="2" required>${escapeHtml(task?.description || "")}</textarea>
        </div>
        <div class="field-row">
          <div class="field">
            <label for="priority">Priority</label>
            <select id="priority" name="priority">
              ${PRIORITY_OPTIONS.map(
                (p) => `<option value="${p}" ${task?.priority === p ? "selected" : ""}>${p}</option>`
              ).join("")}
            </select>
          </div>
          <div class="field">
            <label for="status">Status</label>
            <select id="status" name="status">
              ${STATUS_OPTIONS.map(
                (s) => `<option value="${s}" ${task?.status === s ? "selected" : ""}>${s}</option>`
              ).join("")}
            </select>
          </div>
        </div>
        <div class="field">
          <label for="assigned_to">Assigned To</label>
          <input type="text" id="assigned_to" name="assigned_to" value="${escapeHtml(task?.assigned_to || "")}" />
        </div>
        <div class="field-row">
          <div class="field">
            <label for="start_date">Start Date</label>
            <input type="date" id="start_date" name="start_date" value="${task?.start_date || ""}" />
          </div>
          <div class="field">
            <label for="due_date">Date Due</label>
            <input type="date" id="due_date" name="due_date" value="${task?.due_date || ""}" />
          </div>
        </div>
        <div class="field">
          <label for="notes">Notes / Comments / Concerns</label>
          <textarea id="notes" name="notes" rows="3">${escapeHtml(task?.notes || "")}</textarea>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn btn-secondary" id="cancel-btn">Cancel</button>
          <button type="submit" class="btn btn-primary" id="save-btn">${isEdit ? "Save Changes" : "Create Task"}</button>
        </div>
      </form>
    </div>
  `;

  document.body.appendChild(backdrop);

  const close = () => backdrop.remove();
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) close();
  });
  backdrop.querySelector("#cancel-btn").addEventListener("click", close);

  backdrop.querySelector("#task-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.target;
    const errorBox = backdrop.querySelector("#modal-error");
    const saveBtn = backdrop.querySelector("#save-btn");
    errorBox.innerHTML = "";

    const payload = {
      description: form.description.value.trim(),
      priority: form.priority.value,
      status: form.status.value,
      assigned_to: form.assigned_to.value.trim(),
      start_date: form.start_date.value || null,
      due_date: form.due_date.value || null,
      notes: form.notes.value.trim(),
    };

    saveBtn.disabled = true;
    saveBtn.textContent = "Saving…";
    try {
      if (isEdit) {
        await api.updateTask(task.id, payload);
      } else {
        await api.createTask(payload);
      }
      close();
      if (onSaved) onSaved();
    } catch (err) {
      errorBox.innerHTML = `<div class="error-banner">${err.message}</div>`;
      saveBtn.disabled = false;
      saveBtn.textContent = isEdit ? "Save Changes" : "Create Task";
    }
  });
}
