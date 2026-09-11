import { registerRoute, startRouter, currentPath, navigate } from "./router.js";
import { isAuthenticated, getUsername, clearSession } from "./api.js";
import { renderLogin } from "./views/login.js";
import { renderDashboard } from "./views/dashboard.js";
import { renderTasks } from "./views/tasks.js";
import { renderDates } from "./views/dates.js";
import { renderArchive } from "./views/archive.js";
import { renderReport } from "./views/report.js";

const NAV_ITEMS = [
  { path: "/dashboard", label: "Dashboard", icon: "&#9673;" },
  { path: "/tasks", label: "Tasks", icon: "&#9776;" },
  { path: "/dates", label: "Important Dates", icon: "&#128197;" },
  { path: "/report", label: "Monthly Report", icon: "&#128202;" },
  { path: "/archive", label: "Archive", icon: "&#128451;" },
];

const appEl = document.getElementById("app");

function renderShell(activeBase) {
  const username = getUsername() || "";
  const initial = username ? username[0].toUpperCase() : "?";

  appEl.innerHTML = `
    <aside class="sidebar">
      <div class="brand"><span class="dot"></span><span class="label">Task Manager</span></div>
      <nav id="nav-links"></nav>
      <div class="sidebar-footer">
        <div class="user-chip">
          <div class="avatar">${initial}</div>
          <span class="label">${username}</span>
        </div>
        <button class="logout-btn" id="logout-btn">Log Out</button>
      </div>
    </aside>
    <main class="main"><div id="view-root"></div></main>
  `;

  const navLinks = appEl.querySelector("#nav-links");
  navLinks.innerHTML = NAV_ITEMS.map(
    (item) => `
      <a class="nav-link ${item.path === activeBase ? "active" : ""}" data-path="${item.path}">
        <span class="icon">${item.icon}</span><span class="label">${item.label}</span>
      </a>`
  ).join("");

  navLinks.querySelectorAll(".nav-link").forEach((el) => {
    el.addEventListener("click", () => navigate(el.dataset.path));
  });

  appEl.querySelector("#logout-btn").addEventListener("click", () => {
    clearSession();
    navigate("/login");
  });

  return appEl.querySelector("#view-root");
}

function renderAuthOnly(handler) {
  return async (_root, params) => {
    const viewRoot = renderShell(currentPath().split("?")[0]);
    await handler(viewRoot, params);
  };
}

registerRoute("/login", async (root) => {
  appEl.innerHTML = "";
  await renderLogin(appEl);
});

registerRoute("/dashboard", renderAuthOnly(renderDashboard));
registerRoute("/tasks", renderAuthOnly(renderTasks));
registerRoute("/dates", renderAuthOnly(renderDates));
registerRoute("/report", renderAuthOnly(renderReport));
registerRoute("/archive", renderAuthOnly(renderArchive));
registerRoute("/not-found", renderAuthOnly(async (root) => {
  root.innerHTML = `<div class="empty-state"><div class="big-icon">404</div><p>Page not found.</p></div>`;
}));

startRouter(appEl, {
  onNavigate: (base) => {
    const authed = isAuthenticated();
    if (base !== "/login" && !authed) {
      navigate("/login");
      return false;
    }
    if (base === "/login" && authed) {
      navigate("/dashboard");
      return false;
    }
    return true;
  },
});
