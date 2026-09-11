import { api, setSession } from "../api.js";
import { navigate } from "../router.js";

export async function renderLogin(root) {
  root.innerHTML = `
    <div class="login-screen">
      <div class="login-card">
        <div class="login-brand-dot"></div>
        <h1>Task Manager</h1>
        <p class="sub">Sign in to manage tasks, dates, and status reports.</p>
        <div id="login-error"></div>
        <form id="login-form">
          <div class="field">
            <label for="username">Username</label>
            <input type="text" id="username" name="username" autocomplete="username" required />
          </div>
          <div class="field">
            <label for="password">Password</label>
            <input type="password" id="password" name="password" autocomplete="current-password" required />
          </div>
          <button type="submit" class="btn btn-primary" style="width:100%; justify-content:center;">
            Sign In
          </button>
        </form>
      </div>
    </div>
  `;

  const form = root.querySelector("#login-form");
  const errorBox = root.querySelector("#login-error");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorBox.innerHTML = "";
    const username = form.username.value.trim();
    const password = form.password.value;
    const submitBtn = form.querySelector("button[type=submit]");
    submitBtn.disabled = true;
    submitBtn.textContent = "Signing in…";
    try {
      const data = await api.login(username, password);
      setSession(data.token, data.username);
      navigate("/dashboard");
    } catch (err) {
      errorBox.innerHTML = `<div class="error-banner">${err.message || "Login failed."}</div>`;
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Sign In";
    }
  });
}
