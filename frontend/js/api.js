import { API_BASE_URL } from "./config.js";

const TOKEN_KEY = "taskmanager_token";
const USER_KEY = "taskmanager_user";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setSession(token, username) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, username);
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function getUsername() {
  return localStorage.getItem(USER_KEY);
}

export function isAuthenticated() {
  return !!getToken();
}

class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

async function request(path, { method = "GET", body, auth = true } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (auth) {
    const token = getToken();
    if (token) headers["Authorization"] = `Token ${token}`;
  }

  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (networkErr) {
    throw new ApiError(
      "Could not reach the server. Check that the API is running and reachable.",
      0,
      null
    );
  }

  if (response.status === 401) {
    clearSession();
    throw new ApiError("Session expired. Please log in again.", 401, null);
  }

  if (response.status === 204) return null;

  let data = null;
  const text = await response.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    const message =
      (data && (data.detail || JSON.stringify(data))) ||
      `Request failed with status ${response.status}`;
    throw new ApiError(message, response.status, data);
  }

  return data;
}

export const api = {
  login: (username, password) =>
    request("/auth/login/", { method: "POST", body: { username, password }, auth: false }),

  kpiSummary: () => request("/kpi/summary/"),

  importantDates: () => request("/important-dates/"),

  monthlyReport: (year, month) => request(`/reports/monthly/?year=${year}&month=${month}`),

  listTasks: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/tasks/${qs ? `?${qs}` : ""}`);
  },

  getTask: (id) => request(`/tasks/${id}/`),

  createTask: (payload) => request("/tasks/", { method: "POST", body: payload }),

  updateTask: (id, payload) => request(`/tasks/${id}/`, { method: "PATCH", body: payload }),

  deleteTask: (id) => request(`/tasks/${id}/`, { method: "DELETE" }),

  archiveTask: (id) => request(`/tasks/${id}/archive/`, { method: "POST" }),

  unarchiveTask: (id) => request(`/tasks/${id}/unarchive/`, { method: "POST" }),
};

export { ApiError };
