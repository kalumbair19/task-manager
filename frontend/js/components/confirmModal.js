import { escapeHtml } from "../utils.js";

/**
 * A clear, unambiguous confirmation dialog -- replaces the native
 * confirm() popup (whose wording, e.g. "This cannot be undone", was being
 * misread as the app refusing the action). Resolves true if the user
 * confirms, false if they cancel or dismiss it.
 */
export function confirmAction({ title, message, confirmLabel = "Confirm", danger = false } = {}) {
  return new Promise((resolve) => {
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    backdrop.innerHTML = `
      <div class="modal modal-sm">
        <h2>${escapeHtml(title || "Are you sure?")}</h2>
        <p>${escapeHtml(message || "")}</p>
        <div class="modal-actions">
          <button type="button" class="btn btn-secondary" id="confirm-cancel-btn">Cancel</button>
          <button type="button" class="btn ${danger ? "btn-danger" : "btn-primary"}" id="confirm-ok-btn">${escapeHtml(
      confirmLabel
    )}</button>
        </div>
      </div>
    `;
    document.body.appendChild(backdrop);

    const finish = (result) => {
      backdrop.remove();
      resolve(result);
    };

    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) finish(false);
    });
    backdrop.querySelector("#confirm-cancel-btn").addEventListener("click", () => finish(false));
    backdrop.querySelector("#confirm-ok-btn").addEventListener("click", () => finish(true));
  });
}
