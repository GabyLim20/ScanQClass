"use strict";

const TOKEN_KEY = "token";
const USER_KEY = "user";

function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function logout() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  window.location.href = "/assets/views/login.html";
}

function getStoredUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) || "null");
  } catch {
    return null;
  }
}

function saveStoredUser(user) {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

function redirectToPasswordChange() {
  window.location.href = "/assets/views/changePassword.html";
}

function authHeaders() {
  return {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${getToken()}`
  };
}

async function apiGet(url) {
  const res = await fetch(url, { method: "GET", headers: authHeaders() });

  if (res.status === 403) {
    const data = await res.json().catch(() => ({}));
    if (data?.must_change_password) {
      const user = getStoredUser();
      if (user) saveStoredUser({ ...user, must_change_password: true });
      redirectToPasswordChange();
      return null;
    }
    logout();
    return null;
  }

  if (res.status === 401) {
    logout();
    return null;
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
  return data;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getCurrentMonthValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function getStudentIdFromQuery() {
  return new URLSearchParams(window.location.search).get("id");
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function renderAdminSidebarProfile() {
  const user = getStoredUser();
  const fullName = `${user?.name || ""} ${user?.lastname || ""}`.trim() || "Administrador";
  const email = user?.email || "admin@sems.com";
  setText("admin-sidebar-name", fullName);
  setText("admin-sidebar-email", email);
}

function setLoading(isLoading) {
  document.getElementById("history-loading")?.classList.toggle("d-none", !isLoading);
  document.getElementById("history-content")?.classList.toggle("d-none", isLoading);
}

function showError(message) {
  const errorEl = document.getElementById("history-error");
  if (!errorEl) return;
  errorEl.textContent = message || "No se pudo cargar el historial.";
  errorEl.classList.remove("d-none");
}

function clearError() {
  document.getElementById("history-error")?.classList.add("d-none");
}

function formatPercent(value) {
  return `${Number(value || 0).toFixed(1)}%`;
}

function getRiskBadgeClass(risk) {
  if (risk === "Alto") return "bg-danger-subtle text-danger";
  if (risk === "Medio") return "bg-warning-subtle text-warning";
  if (risk === "Bajo") return "bg-success-subtle text-success";
  return "bg-secondary-subtle text-secondary";
}

function renderStudent(student = {}) {
  setText("student-name", student.name || "Alumno");
  setText("student-code", `Código: ${student.code || "—"}`);
  setText("student-section", `Sección: ${student.section || "—"}`);
  setText("student-status", `Estado: ${student.status || "—"}`);
  setText("student-email", `Correo: ${student.email || "—"}`);
}

function renderSummary(summary = {}) {
  setText("summary-courses", summary.courses ?? 0);
  setText("summary-attendances", summary.totalAttendances ?? 0);
  setText("summary-lates", summary.totalLates ?? 0);
  setText("summary-absences", summary.totalAbsences ?? 0);
  setText("summary-justified", summary.totalJustified ?? 0);
  setText("summary-percentage", formatPercent(summary.attendancePercentage));
}

function renderCourses(courses = [], summary = {}) {
  const tbody = document.getElementById("history-tbody");
  const emptyEl = document.getElementById("history-empty");
  if (!tbody || !emptyEl) return;

  const hasRecords = Number(summary.totalClasses || 0) > 0;
  emptyEl.classList.toggle("d-none", hasRecords);

  if (!hasRecords) {
    tbody.innerHTML = `<tr><td colspan="9" class="text-center text-muted py-3">No hay registros de asistencia para este periodo.</td></tr>`;
    return;
  }

  tbody.innerHTML = courses.map(course => `
    <tr>
      <td class="fw-semibold">${escapeHtml(course.subject || "—")}</td>
      <td>${escapeHtml(course.teacher || "—")}</td>
      <td>${Number(course.attendances || 0)}</td>
      <td>${Number(course.lates || 0)}</td>
      <td>${Number(course.absences || 0)}</td>
      <td>${Number(course.justified || 0)}</td>
      <td>${Number(course.totalClasses || 0)}</td>
      <td>${formatPercent(course.attendancePercentage)}</td>
      <td><span class="badge ${getRiskBadgeClass(course.risk)}">${escapeHtml(course.risk || "Sin datos")}</span></td>
    </tr>
  `).join("");
}

async function loadHistory() {
  const studentId = getStudentIdFromQuery();
  const month = document.getElementById("history-month")?.value || getCurrentMonthValue();

  if (!studentId || Number.isNaN(Number(studentId))) {
    setLoading(false);
    showError("No se indicó un alumno válido.");
    return;
  }

  clearError();
  setLoading(true);

  try {
    const params = new URLSearchParams({ month });
    const data = await apiGet(`/admin/students/${encodeURIComponent(studentId)}/attendance-history?${params.toString()}`);
    if (!data) return;

    renderStudent(data.student || {});
    renderSummary(data.summary || {});
    renderCourses(data.courses || [], data.summary || {});
  } catch (err) {
    showError(err.message || "No se pudo cargar el historial.");
  } finally {
    setLoading(false);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  if (!getToken()) {
    logout();
    return;
  }
  if (getStoredUser()?.must_change_password) {
    redirectToPasswordChange();
    return;
  }

  renderAdminSidebarProfile();

  const monthInput = document.getElementById("history-month");
  const queryMonth = new URLSearchParams(window.location.search).get("month");
  if (monthInput) monthInput.value = /^\d{4}-\d{2}$/.test(String(queryMonth || "")) ? queryMonth : getCurrentMonthValue();

  document.getElementById("history-refresh-btn")?.addEventListener("click", loadHistory);
  document.getElementById("history-month")?.addEventListener("change", loadHistory);
  document.getElementById("admin-sidebar-logout-btn")?.addEventListener("click", logout);

  loadHistory();
});
