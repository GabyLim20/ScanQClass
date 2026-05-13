"use strict";

const TOKEN_KEY = "token";
const USER_KEY = "user";

function getToken() { return localStorage.getItem(TOKEN_KEY); }

function authHeaders(json = true) {
  const h = { "Authorization": `Bearer ${getToken()}` };
  if (json) h["Content-Type"] = "application/json";
  return h;
}

function logout() {
  localStorage.clear();
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

function activateTeacherSection(sectionId) {
  const target = sectionId || "home";
  document.querySelectorAll(".teacher-section").forEach(section => {
    section.classList.toggle("is-active", section.id === `teacher-section-${target}`);
  });
  document.querySelectorAll("[data-teacher-section]").forEach(btn => {
    btn.classList.toggle("is-active", btn.classList.contains("teacher-nav-btn") && btn.dataset.teacherSection === target);
  });
}

async function api(method, url, body = null) {
  const opts = { method, headers: authHeaders() };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
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
  if (res.status === 401) { logout(); return null; }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
  return data;
}

function updateAttendanceCircle(percentage) {
  const circle = document.getElementById("teacher-circular-progress");
  const valueEl = document.getElementById("teacher-attendance-percentage");
  const safePercentage = Number.isFinite(Number(percentage)) ? Math.max(0, Math.min(100, Number(percentage))) : 0;
  const angle = (safePercentage / 100) * 360;

  if (circle) {
    circle.style.background = `conic-gradient(var(--primary-color) 0deg ${angle}deg, #e5e7eb ${angle}deg 360deg)`;
  }
  if (valueEl) {
    valueEl.textContent = `${safePercentage}%`;
  }
}

async function loadDashboard() {
  const totalStudentsEl = document.getElementById("teacher-total-students");
  const attendanceTodayEl = document.getElementById("teacher-attendance-today");
  const lastWeekEl = document.getElementById("teacher-last-week");
  const lastMonthEl = document.getElementById("teacher-last-month");

  try {
    const data = await api("GET", "/teacher/dashboard");
    if (!data) return;

    if (totalStudentsEl) totalStudentsEl.textContent = String(data.total_students ?? 0);
    if (attendanceTodayEl) attendanceTodayEl.textContent = String(data.attendance_today ?? 0);
    if (lastWeekEl) lastWeekEl.textContent = `${data.last_week_percentage ?? 0}%`;
    if (lastMonthEl) lastMonthEl.textContent = `${data.last_month_percentage ?? 0}%`;
    updateAttendanceCircle(data.attendance_percentage ?? 0);
  } catch (_) {
    if (totalStudentsEl) totalStudentsEl.textContent = "0";
    if (attendanceTodayEl) attendanceTodayEl.textContent = "0";
    if (lastWeekEl) lastWeekEl.textContent = "0%";
    if (lastMonthEl) lastMonthEl.textContent = "0%";
    updateAttendanceCircle(0);
  }
}

function formatPendingDate(dateValue) {
  if (!dateValue) return "—";
  const [year, month, day] = String(dateValue).split("-");
  if (!year || !month || !day) return dateValue;
  return `${day}/${month}/${year}`;
}

function getHistoryMonthFromDate(dateValue) {
  if (!dateValue || !/^\d{4}-\d{2}-\d{2}$/.test(String(dateValue))) {
    return new Date().toISOString().slice(0, 7);
  }
  return String(dateValue).slice(0, 7);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const pendingJustificationMap = new Map();

function formatAiScore(score) {
  return score != null && Number.isFinite(Number(score))
    ? `${Math.round(Number(score) * 100)}%`
    : "Sin análisis IA";
}

function formatAiCategory(category) {
  const normalized = String(category || "").trim().toLowerCase();
  if (normalized === "salud") return "Salud";
  if (normalized === "personal") return "Personal";
  if (normalized === "otro") return "Otro";
  if (normalized === "error" || !normalized) return "Otro";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

async function fetchProtectedEvidenceObjectUrl(url) {
  const res = await fetch(url, {
    method: "GET",
    headers: { "Authorization": `Bearer ${getToken()}` }
  });

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

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Error ${res.status}`);
  }

  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

function openPendingJustificationDetail(attendanceId) {
  const item = pendingJustificationMap.get(Number(attendanceId));
  if (!item) return;

  document.getElementById("teacher-justification-review-wrapper")?.remove();

  const wrapper = document.createElement("div");
  wrapper.id = "teacher-justification-review-wrapper";
  wrapper.innerHTML = `
    <div class="modal fade" id="teacher-justification-review-modal" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered modal-lg">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">Revisar justificación</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <div class="modal-body">
            <ul class="list-unstyled mb-3">
              <li><strong>Estudiante:</strong> ${escapeHtml(item.student_name)}${item.student_code ? ` · ${escapeHtml(item.student_code)}` : ""}</li>
              <li><strong>Fecha:</strong> ${escapeHtml(formatPendingDate(item.date))}</li>
              <li><strong>Materia:</strong> ${escapeHtml(item.course_name)} — ${escapeHtml(item.section_name || "—")}</li>
            </ul>
            <div class="border rounded-3 p-3 mb-3">
              <div class="small text-muted mb-2">Motivo del alumno</div>
              <div>${escapeHtml(item.original_text || "—")}</div>
            </div>
            <div class="border rounded-3 bg-light p-3 mb-3">
              <div class="small text-muted mb-2">Análisis IA</div>
              <div><strong>Clasificación:</strong> ${escapeHtml(formatAiCategory(item.ai_category))}</div>
              <div><strong>Score:</strong> ${escapeHtml(formatAiScore(item.ai_score ?? item.ai_confidence))}</div>
              <div><strong>Resumen:</strong> Se recomienda revisión manual para confirmar la justificación.</div>
            </div>
            <div class="border rounded-3 p-3 bg-light">
              <div class="small text-muted mb-2">Evidencia adjunta</div>
              <img id="teacher-justification-evidence-image" alt="Evidencia de justificación" class="img-fluid rounded border mb-2 d-none" style="max-width:100%;max-height:320px;object-fit:contain;">
              <div id="teacher-justification-evidence-message" class="small text-muted">${item.justification_image_url ? "Cargando evidencia..." : "Sin evidencia adjunta."}</div>
            </div>
            <div id="teacher-justification-review-feedback" class="small text-danger mt-2 d-none"></div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-outline-danger" id="teacher-review-reject-btn">Rechazar</button>
            <button type="button" class="btn btn-primary" id="teacher-review-approve-btn">Aceptar</button>
          </div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(wrapper);

  const modalEl = document.getElementById("teacher-justification-review-modal");
  const modal = new bootstrap.Modal(modalEl);
  const approveBtn = document.getElementById("teacher-review-approve-btn");
  const rejectBtn = document.getElementById("teacher-review-reject-btn");
  const feedbackEl = document.getElementById("teacher-justification-review-feedback");
  const evidenceImgEl = document.getElementById("teacher-justification-evidence-image");
  const evidenceMsgEl = document.getElementById("teacher-justification-evidence-message");
  let evidenceObjectUrl = null;

  const releaseEvidenceObjectUrl = () => {
    if (!evidenceObjectUrl) return;
    URL.revokeObjectURL(evidenceObjectUrl);
    evidenceObjectUrl = null;
  };

  if (item.justification_image_url && evidenceImgEl && evidenceMsgEl) {
    fetchProtectedEvidenceObjectUrl(item.justification_image_url)
      .then(objectUrl => {
        if (!objectUrl) return;
        releaseEvidenceObjectUrl();
        evidenceObjectUrl = objectUrl;
        evidenceImgEl.src = objectUrl;
        evidenceImgEl.classList.remove("d-none");
        evidenceMsgEl.textContent = "";
      })
      .catch(() => {
        evidenceImgEl.classList.add("d-none");
        evidenceImgEl.src = "";
        evidenceMsgEl.textContent = "No se pudo cargar la evidencia.";
      });
  }

  approveBtn?.addEventListener("click", async () => {
    if (approveBtn) approveBtn.disabled = true;
    if (rejectBtn) rejectBtn.disabled = true;
    try {
      await approvePendingJustification(item.id_attendance, { skipReload: true, skipToast: true });
      modal.hide();
      toast("Justificación aceptada.");
      await loadPendingJustifications();
    } catch (err) {
      if (feedbackEl) {
        feedbackEl.textContent = err.message || "No se pudo aceptar la justificación.";
        feedbackEl.classList.remove("d-none");
      }
    } finally {
      if (approveBtn) approveBtn.disabled = false;
      if (rejectBtn) rejectBtn.disabled = false;
    }
  });

  rejectBtn?.addEventListener("click", async () => {
    if (approveBtn) approveBtn.disabled = true;
    if (rejectBtn) rejectBtn.disabled = true;
    try {
      await rejectPendingJustification(item.id_attendance, { skipReload: true, skipToast: true });
      modal.hide();
      toast("Justificación rechazada.");
      await loadPendingJustifications();
    } catch (err) {
      if (feedbackEl) {
        feedbackEl.textContent = err.message || "No se pudo rechazar la justificación.";
        feedbackEl.classList.remove("d-none");
      }
    } finally {
      if (approveBtn) approveBtn.disabled = false;
      if (rejectBtn) rejectBtn.disabled = false;
    }
  });

  modalEl.addEventListener("hidden.bs.modal", () => {
    releaseEvidenceObjectUrl();
    wrapper.remove();
  }, { once: true });
  modal.show();
}

async function loadPendingJustifications() {
  const countEl = document.getElementById("teacher-pending-count");
  const listEl = document.getElementById("teacher-pending-list");
  if (!countEl || !listEl) return;

  try {
    const data = await api("GET", "/teacher/justifications/pending");
    if (!data) return;

    const items = Array.isArray(data.items) ? data.items : [];
    pendingJustificationMap.clear();
    items.forEach(item => pendingJustificationMap.set(Number(item.id_attendance), item));
    const count = String(data.pending_count ?? items.length);
    countEl.textContent = count;
    const navCount = document.getElementById("teacher-nav-pending-count");
    if (navCount) navCount.textContent = count;

    if (!items.length) {
      listEl.innerHTML = `<div class="list-group-item text-center text-muted py-3">No hay solicitudes pendientes.</div>`;
      return;
    }

    listEl.innerHTML = items.map(item => `
      <div class="list-group-item" id="pending-justification-${item.id_attendance}">
        <div class="d-flex flex-wrap justify-content-between gap-3">
          <div class="flex-grow-1">
            <div class="fw-semibold">${escapeHtml(item.student_name)}${item.student_code ? ` · ${escapeHtml(item.student_code)}` : ""}</div>
            <div class="small text-muted">${escapeHtml(item.course_name)} — ${escapeHtml(item.section_name)} · ${formatPendingDate(item.date)}</div>
            <div class="mt-2"><strong>Motivo:</strong> ${escapeHtml(item.original_text)}</div>
            <div class="small text-muted mt-1">
              Clasificación: ${escapeHtml(formatAiCategory(item.ai_category))}
            </div>
            <div class="small text-muted mt-1">
              IA: revisar · ${formatAiScore(item.ai_score ?? item.ai_confidence)}
            </div>
          </div>
          <div class="d-flex flex-column flex-sm-row gap-2 align-items-start align-items-sm-center">
            <button class="btn btn-outline-secondary btn-sm" onclick="openPendingJustificationDetail(${item.id_attendance})">Revisar</button>
            <button class="btn btn-primary btn-sm" onclick="approvePendingJustification(${item.id_attendance})">Aceptar</button>
            <button class="btn btn-outline-danger btn-sm" onclick="rejectPendingJustification(${item.id_attendance})">Rechazar</button>
            <a class="btn btn-outline-secondary btn-sm"
               href="/assets/views/historyclass.html?id_course=${item.id_course}&name=${encodeURIComponent(item.course_name)}&month=${getHistoryMonthFromDate(item.date)}">
              Ver detalle
            </a>
          </div>
        </div>
      </div>
    `).join("");
  } catch (err) {
    countEl.textContent = "0";
    const navCount = document.getElementById("teacher-nav-pending-count");
    if (navCount) navCount.textContent = "0";
    listEl.innerHTML = `<div class="list-group-item text-danger text-center py-3">${escapeHtml(err.message || "No se pudieron cargar las solicitudes.")}</div>`;
  }
}

async function approvePendingJustification(id, options = {}) {
  const { skipReload = false, skipToast = false } = options;
  try {
    const res = await api("PUT", `/teacher/justifications/${id}/approve`);
    if (!skipToast) toast(res?.message || "Justificación aceptada.");
    document.getElementById(`pending-justification-${id}`)?.remove();
    pendingJustificationMap.delete(Number(id));
    if (!skipReload) await loadPendingJustifications();
    return res;
  } catch (err) {
    if (!skipToast) toast(err.message || "No se pudo aceptar la justificación.", "danger");
    throw err;
  }
}

async function rejectPendingJustification(id, options = {}) {
  const { skipReload = false, skipToast = false } = options;
  try {
    const res = await api("PUT", `/teacher/justifications/${id}/reject`);
    if (!skipToast) toast(res?.message || "Justificación rechazada.");
    document.getElementById(`pending-justification-${id}`)?.remove();
    pendingJustificationMap.delete(Number(id));
    if (!skipReload) await loadPendingJustifications();
    return res;
  } catch (err) {
    if (!skipToast) toast(err.message || "No se pudo rechazar la justificación.", "danger");
    throw err;
  }
}

function toast(msg, type = "success") {
  const el = Object.assign(document.createElement("div"), {
    className: `alert alert-${type} position-fixed bottom-0 end-0 m-3 shadow`,
    style: "z-index:9999;min-width:280px",
    textContent: msg
  });
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

let activeQrScanner = null;
let activeQrScannerId = null;

async function stopActiveQrScanner() {
  if (!activeQrScanner) return;
  try {
    if (typeof activeQrScanner.isScanning === "function" && activeQrScanner.isScanning()) {
      await activeQrScanner.stop();
    } else if (activeQrScanner.stop) {
      await activeQrScanner.stop().catch(() => {});
    }
  } catch (_) {}

  try { await activeQrScanner.clear?.(); } catch (_) {}
  activeQrScanner = null;
  activeQrScannerId = null;
}

function setGreeting() {
  try {
    const payload = JSON.parse(atob(getToken().split(".")[1]));
    const name    = payload.name || "Maestro";
    const greet   = document.getElementById("teacher-greeting");
    const dateEl  = document.getElementById("teacher-date");
    if (greet) greet.textContent = `Hola, ${name}`;
    if (dateEl) dateEl.textContent = new Date().toLocaleDateString("es-MX", {
      weekday: "long", year: "numeric", month: "long", day: "numeric"
    });
  } catch (_) {}
}

async function loadClasses() {
  const tbody = document.getElementById("classes-tbody");
  if (!tbody) return;

  try {
    const data = await api("GET", "/teacher/classes");
    if (!data) return;

    if (!data.length) {
      tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-3">No tienes clases asignadas.</td></tr>`;
      return;
    }

    const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM

    tbody.innerHTML = data.map(row => {
      const c = row.course || {};
      const sectionName = c.section?.name || "—";
      const schedulesText = Array.isArray(c.schedules) && c.schedules.length > 0
        ? c.schedules
            .map(s => `${s.day_of_week} ${String(s.start_time || "").slice(0, 5)}-${String(s.end_time || "").slice(0, 5)}`)
            .join("<br>")
        : "Sin horario asignado";
      const totalStudents = Array.isArray(c.enrollments) ? c.enrollments.length : "—";
      return `
        <tr>
          <td>${c.name_subject || "—"}</td>
          <td>${sectionName}</td>
          <td>${schedulesText}</td>
          <td>${totalStudents}</td>
          <td class="text-end">
            <a href="/assets/views/historyclass.html?id_course=${c.id_course}&name=${encodeURIComponent(c.name_subject)}&month=${currentMonth}"
               class="btn btn-outline-secondary btn-sm">Historial</a>
            <button class="btn btn-outline-secondary btn-sm"
                    onclick="openPdfModal(${c.id_course}, '${c.name_subject.replace(/'/g,"\\'")}')">
              <i class="bi bi-file-earmark-pdf"></i> PDFs
            </button>
            <button class="btn btn-outline-primary btn-sm"
                    onclick="openScanModal(${c.id_course}, '${c.name_subject.replace(/'/g,"\\'")}')">
              <i class="bi bi-qr-code-scan"></i> Escanear
            </button>
            <button class="btn btn-primary btn-sm"
                    onclick="closeAttendanceForCourse(${c.id_course}, '${c.name_subject.replace(/'/g,"\\'")}')">
              <i class="bi bi-person-x me-1"></i> Cerrar asistencia
            </button>
          </td>
        </tr>`;
    }).join("");
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5" class="text-danger text-center py-3">${err.message}</td></tr>`;
  }
}

let activePdfPreviewUrl = null;

async function fetchPdfBlob(id_course, pdfId) {
  const res = await fetch(`/teacher/classes/${id_course}/pdf/${pdfId}`, {
    method: "GET",
    headers: { "Authorization": `Bearer ${getToken()}` }
  });

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
  if (res.status === 401) { logout(); return null; }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Error ${res.status}`);
  }

  return res.blob();
}

function buildPdfListMarkup(id_course, pdfs = []) {
  return pdfs.length
    ? pdfs.map(p => `
        <li class="list-group-item d-flex justify-content-between align-items-center" id="pdf-item-${p.id}">
          <div class="d-flex flex-column flex-grow-1 me-2">
            <span class="text-truncate">${p.filename}</span>
            <small class="text-muted">${new Date(p.uploaded_at).toLocaleDateString("es-MX")}</small>
          </div>
          <div class="d-flex gap-2">
            <button class="btn btn-outline-primary btn-sm"
                    onclick="viewPdf(${id_course}, ${p.id}, '${String(p.filename || "").replace(/'/g, "\\'")}')">
              Ver
            </button>
            <button class="btn btn-outline-secondary btn-sm"
                    onclick="downloadPdf(${id_course}, ${p.id}, '${String(p.filename || "").replace(/'/g, "\\'")}')">
              Descargar
            </button>
            <button class="btn btn-outline-danger btn-sm"
                    onclick="deletePdf(${id_course}, ${p.id}, '${String(p.filename || "").replace(/'/g, "\\'")}')">
              Eliminar
            </button>
          </div>
        </li>`).join("")
    : `<li class="list-group-item text-muted" id="empty-pdf-item">Sin PDFs subidos.</li>`;
}

async function openPdfModal(id_course, courseName) {
  let pdfs = [];
  try { pdfs = await api("GET", `/teacher/classes/${id_course}/pdfs`) || []; }
  catch (err) { toast(err.message, "danger"); return; }

  const list = buildPdfListMarkup(id_course, pdfs);

  showModal(`PDFs — ${courseName}`, `
      <label class="form-label fw-bold">Subir nuevo PDF</label>
      <div class="pdf-upload-row mb-3">
        <input type="file" id="pdf-input" class="form-control" accept="application/pdf">
        <button type="button" class="btn btn-primary" id="pdf-upload-btn">Subir</button>
      </div>
	    <ul class="list-group mb-3" id="pdf-list">${list}</ul>
      <div class="border rounded-3 p-2 mb-3 bg-light">
        <div class="small text-muted mb-2" id="pdf-preview-label">Selecciona un PDF para visualizarlo.</div>
        <iframe id="pdf-preview-frame" title="Vista previa de PDF"
          class="w-100 rounded border bg-white" style="height: 420px;"
          src="about:blank"></iframe>
      </div>
	  `, async () => {}, "primary", "teacher-modal-wide", "Subir", true);

  document.getElementById("pdf-upload-btn")?.addEventListener("click", async () => {
    const fileInput = document.getElementById("pdf-input");
    if (!fileInput?.files[0]) {
      toast("Selecciona un archivo PDF", "warning");
      return;
    }

    const formData = new FormData();
    formData.append("file", fileInput.files[0]);
    const res = await fetch(`/teacher/classes/${id_course}/pdf`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${getToken()}` },
      body: formData
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast(data.error || "Error al subir PDF", "danger");
      return;
    }
    if (fileInput) fileInput.value = "";

    let refreshedPdfs = [];
    try {
      refreshedPdfs = await api("GET", `/teacher/classes/${id_course}/pdfs`) || [];
    } catch (err) {
      toast(err.message || "Error al recargar la lista de PDFs", "danger");
      return;
    }

    const listEl = document.getElementById("pdf-list");
    if (listEl) {
      listEl.innerHTML = buildPdfListMarkup(id_course, refreshedPdfs);
    }

    toast("PDF subido correctamente");

    const createdPdfId = data?.pdf?.id;
    const createdFilename = data?.pdf?.filename;
    if (createdPdfId) {
      viewPdf(id_course, createdPdfId, createdFilename || "archivo.pdf");
      return;
    }

    if (refreshedPdfs.length > 0) {
      const latestPdf = refreshedPdfs[0];
      viewPdf(id_course, latestPdf.id, latestPdf.filename || "archivo.pdf");
    }
  });

  document.getElementById("_gm")?.addEventListener("hidden.bs.modal", () => {
    if (activePdfPreviewUrl) {
      URL.revokeObjectURL(activePdfPreviewUrl);
      activePdfPreviewUrl = null;
    }
  }, { once: true });
}

async function downloadPdf(id_course, pdfId, filename = "archivo.pdf") {
  try {
    const blob = await fetchPdfBlob(id_course, pdfId);
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename || "archivo.pdf";
    a.target = "_blank";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (err) {
    toast(err.message || "Error al descargar PDF", "danger");
  }
}

async function viewPdf(id_course, pdfId, filename = "archivo.pdf") {
  const frame = document.getElementById("pdf-preview-frame");
  const label = document.getElementById("pdf-preview-label");
  if (!frame || !label) return;

  try {
    label.textContent = `Cargando ${filename}...`;
    const blob = await fetchPdfBlob(id_course, pdfId);
    if (!blob) return;

    if (activePdfPreviewUrl) {
      URL.revokeObjectURL(activePdfPreviewUrl);
      activePdfPreviewUrl = null;
    }

    activePdfPreviewUrl = URL.createObjectURL(blob);
    frame.src = activePdfPreviewUrl;
    label.textContent = `Vista previa: ${filename}`;
  } catch (err) {
    frame.src = "about:blank";
    label.textContent = "No se pudo visualizar el PDF.";
    toast(err.message || "Error al visualizar PDF", "danger");
  }
}

async function deletePdf(id_course, pdfId, filename = "archivo.pdf") {
  if (!window.confirm(`¿Eliminar el PDF "${filename}"?`)) return;

  try {
    const res = await fetch(`/teacher/classes/${id_course}/pdf/${pdfId}`, {
      method: "DELETE",
      headers: { "Authorization": `Bearer ${getToken()}` }
    });

    if (res.status === 403) {
      const data = await res.json().catch(() => ({}));
      if (data?.must_change_password) {
        const user = getStoredUser();
        if (user) saveStoredUser({ ...user, must_change_password: true });
        redirectToPasswordChange();
        return;
      }
      logout();
      return;
    }
    if (res.status === 401) { logout(); return; }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Error ${res.status}`);

    document.getElementById(`pdf-item-${pdfId}`)?.remove();
    const remainingItems = document.querySelectorAll("[id^='pdf-item-']");
    if (!remainingItems.length && !document.getElementById("empty-pdf-item")) {
      const list = document.querySelector("#_gm .list-group");
      list?.insertAdjacentHTML("beforeend", `<li class="list-group-item text-muted" id="empty-pdf-item">Sin PDFs subidos.</li>`);
    }

    const label = document.getElementById("pdf-preview-label");
    const frame = document.getElementById("pdf-preview-frame");
    if (label) label.textContent = "Selecciona un PDF para visualizarlo.";
    if (frame) frame.src = "about:blank";
    if (activePdfPreviewUrl) {
      URL.revokeObjectURL(activePdfPreviewUrl);
      activePdfPreviewUrl = null;
    }

    toast(data.message || "PDF eliminado correctamente.");
  } catch (err) {
    toast(err.message || "Error al eliminar PDF", "danger");
  }
}

async function fetchSessionState(id_course) {
  try {
    const data = await api("GET", `/teacher/attendance-sessions/today?id_course=${id_course}`);
    return data?.session || null;   
  } catch (_) {
    return null;
  }
}

function renderSessionBar(session) {
  if (!session) {
    return `<span class="badge bg-secondary">Sin sesión activa</span>`;
  }
  if (session.status === "OPEN") {
    return `<span class="badge bg-success">Sesión abierta</span>
            <button type="button" class="btn btn-outline-warning btn-sm ms-2" id="close-session-btn">
              <i class="bi bi-lock me-1"></i> Cerrar sesión
            </button>`;
  }
  return `<span class="badge bg-danger">Sesión cerrada</span>`;
}

async function closeSessionFromModal(id_session) {
  const statusBar = document.getElementById("session-status-bar");
  try {
    const res = await api("POST", `/teacher/attendance-sessions/${id_session}/close`);

    const s = res?.summary;
    const summaryMsg = s
      ? ` · ${s.existingRecords} presentes, ${s.absencesCreated} falta${s.absencesCreated === 1 ? "" : "s"} generada${s.absencesCreated === 1 ? "" : "s"} (${s.totalEnrolled} inscritos)`
      : "";
    toast((res?.message || "Sesión cerrada.") + summaryMsg);

    if (statusBar) statusBar.innerHTML = `<span class="badge bg-danger">Sesión cerrada</span>`;
    setQrScanBlocked(true);
    return res;
  } catch (err) {
    toast(err.message || "No se pudo cerrar la sesión.", "danger");
    if (err.message?.includes("ya está cerrada")) {
      if (statusBar) statusBar.innerHTML = `<span class="badge bg-danger">Sesión cerrada</span>`;
      setQrScanBlocked(true);
    }
    throw err;
  }
}

async function closeAttendanceForCourse(id_course, courseName) {
  try {
    const session = await fetchSessionState(Number(id_course));

    if (!session?.id_session) {
      toast("Primero debes registrar al menos una asistencia para abrir la sesión", "warning");
      return;
    }

    if (session.status === "CLOSED") {
      toast("La asistencia de esta clase ya está cerrada.", "warning");
      return;
    }

    const confirmed = window.confirm(`Se marcará falta a los alumnos no escaneados hoy en ${courseName}.\n\n¿Deseas continuar?`);
    if (!confirmed) return;

    const res = await api("POST", `/teacher/attendance-sessions/${session.id_session}/close`);
    const summary = res?.summary || {};

    showModal(`Cierre de asistencia — ${courseName}`, `
      <div class="alert alert-success mb-3">${res.message || "Cierre de asistencia completado."}</div>
      <div class="small text-muted">Total inscritos: <strong>${summary.totalEnrolled ?? 0}</strong></div>
      <div class="small text-muted">Ya registrados: <strong>${summary.existingRecords ?? 0}</strong></div>
      <div class="small text-muted">Ausentes creados: <strong>${summary.absencesCreated ?? 0}</strong></div>
    `, async () => {}, "primary", "", "Cerrar", true);

    toast(`Asistencia cerrada. Ausentes creados: ${summary.absencesCreated ?? 0}.`);
  } catch (err) {
    toast(err.message || "No se pudo cerrar la asistencia.", "danger");
  }
}

function setQrScanBlocked(blocked) {
  const qrInput    = document.getElementById("qr-input");
  const startBtn   = document.getElementById("start-camera-btn");
  const confirmBtn = document.getElementById("_gm-ok");
  const resultEl   = document.getElementById("scan-result");
  if (qrInput)    qrInput.disabled    = blocked;
  if (startBtn)   startBtn.disabled   = blocked;
  if (confirmBtn) confirmBtn.disabled = blocked;
  if (blocked && resultEl) {
    resultEl.innerHTML = `<div class="alert alert-warning mb-0">La asistencia de esta clase ya está cerrada.</div>`;
  }
}

async function submitAttendanceToken(token, id_course) {
  return api("POST", "/teacher/attendance/scan", { qr_token: token, id_course });
}

async function startQrCamera(id_course) {
  const resultEl = document.getElementById("scan-result");
  const startBtn = document.getElementById("start-camera-btn");
  const stopBtn = document.getElementById("stop-camera-btn");

  if (!window.Html5Qrcode) {
    if (resultEl) resultEl.innerHTML = `<div class="alert alert-danger mb-0">No se pudo cargar el lector de cámara.</div>`;
    return;
  }

  try {
    await stopActiveQrScanner();
    activeQrScannerId = "qr-reader";
    activeQrScanner = new Html5Qrcode(activeQrScannerId);

    await activeQrScanner.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: 220 },
      async (decodedText) => {
        const qrInput = document.getElementById("qr-input");
        if (qrInput) qrInput.value = decodedText;
        await stopActiveQrScanner();
        if (stopBtn) stopBtn.disabled = true;
        if (startBtn) startBtn.disabled = false;

        try {
          const res = await submitAttendanceToken(decodedText, id_course);
          if (resultEl) resultEl.innerHTML = `<div class="alert alert-success mb-0">${res.message}</div>`;
          toast("Asistencia registrada ✓");
        } catch (err) {
          if (resultEl) resultEl.innerHTML = `<div class="alert alert-danger mb-0">${err.message}</div>`;
        }
      }
    );

    if (resultEl) resultEl.innerHTML = `<div class="alert alert-info mb-0">Cámara activa. Apunta al código QR del alumno.</div>`;
    if (startBtn) startBtn.disabled = true;
    if (stopBtn) stopBtn.disabled = false;
  } catch (err) {
    const msg = /permission|denied|NotAllowedError/i.test(String(err?.message || err))
      ? "Permiso de cámara denegado."
      : "No se pudo iniciar la cámara en este dispositivo.";
    if (resultEl) resultEl.innerHTML = `<div class="alert alert-danger mb-0">${msg}</div>`;
    if (startBtn) startBtn.disabled = false;
    if (stopBtn) stopBtn.disabled = true;
  }
}

function openScanModal(id_course, courseName) {
  showModal(`Escanear QR — ${courseName}`, `
    <div class="d-flex align-items-center gap-2 mb-3" id="session-status-bar">
      <span class="badge bg-secondary">Consultando sesión…</span>
    </div>
    <p class="text-muted small mb-2">
      Usa la cámara para leer el QR o pega manualmente el token del alumno.
    </p>
    <div id="qr-reader" class="border rounded p-2 mb-3 bg-light" style="min-height: 260px;"></div>
    <div class="d-flex gap-2 mb-3">
      <button type="button" class="btn btn-outline-primary btn-sm" id="start-camera-btn">
        <i class="bi bi-camera-video me-1"></i> Iniciar cámara
      </button>
      <button type="button" class="btn btn-outline-secondary btn-sm" id="stop-camera-btn" disabled>
        <i class="bi bi-stop-circle me-1"></i> Detener cámara
      </button>
    </div>
    <textarea id="qr-input" class="form-control font-monospace"
      rows="3" placeholder="SCANQ:eyJhbGci..."></textarea>
    <div id="scan-result" class="mt-2"></div>
  `, async () => {
    const token = document.getElementById("qr-input")?.value.trim();
    if (!token) { toast("Pega el token QR del alumno", "warning"); throw new Error(); }
    try {
      const res = await submitAttendanceToken(token, id_course);
      document.getElementById("scan-result").innerHTML =
        `<div class="alert alert-success mb-0">${res.message}</div>`;
      toast("Asistencia registrada ✓");
      if (res.session?.id_session) {
        const statusBar = document.getElementById("session-status-bar");
        if (statusBar) statusBar.innerHTML = renderSessionBar(res.session);
        wireCloseSessionBtn(res.session);
      }
    } catch (err) {
      document.getElementById("scan-result").innerHTML =
        `<div class="alert alert-danger mb-0">${err.message}</div>`;
      if (err.message?.includes("ya está cerrada")) setQrScanBlocked(true);
      throw err;
    }
  }, "success");

  fetchSessionState(id_course).then(session => {
    const statusBar = document.getElementById("session-status-bar");
    if (!statusBar) return;
    statusBar.innerHTML = renderSessionBar(session);
    if (session?.status === "CLOSED") {
      setQrScanBlocked(true);
    } else if (session) {
      wireCloseSessionBtn(session);
    }
  });

  document.getElementById("start-camera-btn")?.addEventListener("click", () => startQrCamera(id_course));
  document.getElementById("stop-camera-btn")?.addEventListener("click", async () => {
    await stopActiveQrScanner();
    document.getElementById("stop-camera-btn").disabled = true;
    document.getElementById("start-camera-btn").disabled = false;
    const resultEl = document.getElementById("scan-result");
    if (resultEl) {
      resultEl.innerHTML = `<div class="alert alert-secondary mb-0">Cámara detenida.</div>`;
    }
  });
  document.getElementById("_gm")?.addEventListener("hidden.bs.modal", () => {
    stopActiveQrScanner();
  }, { once: true });
}

function wireCloseSessionBtn(session) {
  const btn = document.getElementById("close-session-btn");
  if (!btn || !session?.id_session) return;
  btn.addEventListener("click", () => closeSessionFromModal(session.id_session), { once: true });
}

function showModal(title, bodyHtml, onConfirm, confirmStyle = "primary", dialogClass = "", confirmText = "Confirmar", hideConfirm = false) {
  document.getElementById("_gm-wrapper")?.remove();
  const wrapper = document.createElement("div");
  wrapper.id = "_gm-wrapper";
  wrapper.innerHTML = `
    <div class="modal fade" id="_gm" tabindex="-1">
      <div class="modal-dialog modal-dialog-centered ${dialogClass}">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">${title}</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">${bodyHtml}</div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cerrar</button>
            <button type="button" class="btn btn-${confirmStyle} ${hideConfirm ? "d-none" : ""}" id="_gm-ok">${confirmText}</button>
          </div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(wrapper);
  const instance = new bootstrap.Modal(document.getElementById("_gm"));
  document.getElementById("_gm-ok").addEventListener("click", async () => {
    try { await onConfirm(); instance.hide(); } catch (_) {}
  });
  document.getElementById("_gm").addEventListener("hidden.bs.modal", () => wrapper.remove());
  instance.show();
}


document.addEventListener("DOMContentLoaded", () => {
  if (!getToken()) { logout(); return; }
  if (getStoredUser()?.must_change_password) { redirectToPasswordChange(); return; }
  activateTeacherSection("home");
  document.querySelectorAll("[data-teacher-section]").forEach(btn => {
    btn.addEventListener("click", () => activateTeacherSection(btn.dataset.teacherSection));
  });
  document.getElementById("teacher-logout-btn")?.addEventListener("click", logout);
  setGreeting();
  loadDashboard();
  loadPendingJustifications();
  loadClasses();
});
