const routes = {};

export function registerRoute(path, handler) {
  routes[path] = handler;
}

export function navigate(path) {
  window.location.hash = path;
}

export function currentPath() {
  const hash = window.location.hash.replace(/^#/, "");
  return hash || "/dashboard";
}

export function startRouter(rootEl, { onNavigate } = {}) {
  const render = async () => {
    const path = currentPath();
    const [base] = path.split("?");
    const handler = routes[base] || routes["/not-found"];
    if (onNavigate) {
      const allowed = await onNavigate(base);
      if (allowed === false) return;
    }
    if (handler) {
      rootEl.innerHTML = "";
      await handler(rootEl, new URLSearchParams(path.split("?")[1] || ""));
    }
  };
  window.addEventListener("hashchange", render);
  render();
}
