"use strict";

const TOKEN_KEY = "token";
const USER_KEY = "user";
function getToken() { return localStorage.getItem(TOKEN_KEY); }
function logout() { localStorage.clear(); window.location.href = "/assets/views/login.html"; }
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
let _historyData = null;

function authHeaders() {
    return { "Authorization": `Bearer ${getToken()}`, "Content-Type": "application/json" };
}

async function api(method, url, body = null) {
    const options = { method, headers: authHeaders() };
    if (body) options.body = JSON.stringify(body);
    const res = await fetch(url, options);
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

function getParams() {
    const p = new URLSearchParams(window.location.search);
    const id = p.get("id_course");
    const name = p.get("name") || "Curso";
    const month = p.get("month") || new Date().toISOString().slice(0, 7);
    return { id, name: decodeURIComponent(name), month };
}

const STATUS_CLASS = {
    present: "status-present",
    absent: "status-absent",
    pending: "status-pending",
    late: "status-tardy",
    justified: "status-justified"
};

const STATUS_LABEL = {
    present: "Presente",
    absent: "Inasistencia",
    pending: "Pendiente de justificación",
    late: "Retardo",
    justified: "Justificada"
};

function isAttendanceCredit(status) {
    return status === "present" || status === "late" || status === "justified";
}

function getAttendanceRecordStatus(record) {
    return record?.display_status || record?.status;
}

function formatAiConfidence(value) {
    return value != null && Number.isFinite(Number(value))
        ? `${Math.round(Number(value) * 100)}%`
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
        headers: {
            "Authorization": `Bearer ${getToken()}`
        }
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

function statusCell(userId, courseId, dateKey, record) {
    if (!record) {
        return `<td class="text-center">—</td>`;
    }

    const visualStatus = getAttendanceRecordStatus(record);
    const cls = STATUS_CLASS[visualStatus] || "status-absent";
    const label = STATUS_LABEL[visualStatus] || visualStatus;

    if (visualStatus === "absent" || visualStatus === "pending") {
        return `<td class="text-center">
      <button class="status-dot ${cls}"
        title="${label}"
        data-status="${visualStatus}"
        data-user="${userId}"
        data-course="${courseId}"
        data-date="${dateKey}"
        data-bs-toggle="modal"
        data-bs-target="#justModal">
      </button>
    </td>`;
    }

    if (visualStatus === "late") {
        return `<td class="text-center">
      <i class="bi bi-clock-fill status-tardy" title="${label}"></i>
    </td>`;
    }

    return `<td class="text-center">
    <span class="status-dot ${cls}" title="${label}"></span>
  </td>`;
}

function renderTable(data, courseId) {
    const { fechas, alumnos } = data;

    const thead = document.querySelector("#attendance-table thead tr");
    if (thead) {
        thead.innerHTML = `<th>Alumno</th>` +
            fechas.map(d => {
                const [y, m, day] = d.split("-");
                return `<th class="text-center">${day}/${m}/${y}</th>`;
            }).join("") +
            `<th class="text-center">Total</th>`;
    }

    const tfoot = document.querySelector("#attendance-table tfoot tr");
    if (tfoot) tfoot.innerHTML = thead?.innerHTML || "";

    const tbody = document.querySelector("#attendance-table tbody");
    if (!tbody) return;

    if (!alumnos.length) {
        tbody.innerHTML = `<tr><td colspan="${fechas.length + 2}" class="text-center text-muted py-3">
      Sin alumnos inscritos o sin asistencias en este mes.
    </td></tr>`;
        return;
    }

    tbody.innerHTML = alumnos.map(alumno => {
        const cells = fechas.map(d => statusCell(alumno.user_id, courseId, d, alumno.asistencias[d]));
        const total = Object.values(alumno.asistencias).filter(a => isAttendanceCredit(getAttendanceRecordStatus(a))).length;
        return `
      <tr>
        <td class="fw-semibold">${alumno.nombre}</td>
        ${cells.join("")}
        <td class="text-center fw-bold">${total}/${fechas.length}</td>
      </tr>`;
    }).join("");
}

function exportHistoryCsv() {
    if (!_historyData) return;

    const { fechas = [], alumnos = [], curso = {}, month = "" } = _historyData;
    const header = ["Alumno", ...fechas, "Total asistencias"];
    const rows = alumnos.map(alumno => {
        const total = Object.values(alumno.asistencias || {}).filter(a => isAttendanceCredit(getAttendanceRecordStatus(a))).length;
        return [
            `"${String(alumno.nombre || "").replaceAll('"', '""')}"`,
            ...fechas.map(dateKey => getAttendanceRecordStatus(alumno.asistencias?.[dateKey]) || ""),
            total
        ];
    });

    const csv = [header, ...rows].map(row => row.join(",")).join("\n");
    const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const safeName = String(curso.name_subject || "historial").replace(/[^\w\-]+/g, "_");
    a.href = url;
    a.download = `${safeName}_${month || "mes"}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function buildMonthSelector(currentMonth) {
    const options = [];
    const now = new Date();
    for (let i = 0; i < 6; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const val = d.toISOString().slice(0, 7);
        const lbl = d.toLocaleDateString("es-MX", { month: "long", year: "numeric" });
        options.push(`<option value="${val}" ${val === currentMonth ? "selected" : ""}>${lbl}</option>`);
    }
    const el = document.getElementById("month-select");
    if (el) el.innerHTML = options.join("");
}

async function loadHistory(monthOverride = null) {
    const { id, name, month: defaultMonth } = getParams();
    const month = monthOverride || defaultMonth;

    if (!id) {
        document.querySelector(".container")?.insertAdjacentHTML("afterbegin",
            `<div class="alert alert-warning">No se especificó un curso.</div>`);
        return;
    }

    const titleEl = document.querySelector(".page-title");
    if (titleEl) titleEl.textContent = name;

    buildMonthSelector(month);

    const table = document.getElementById("attendance-table");
    if (table) {
        const tbody = table.querySelector("tbody");
        if (tbody) tbody.innerHTML = `<tr><td colspan="10" class="text-center text-muted py-3">Cargando…</td></tr>`;
    }

    try {
        const data = await api("GET", `/teacher/classes/${id}/history?month=${month}`);
        if (!data) return;
        _historyData = data;

        const url = new URL(window.location.href);
        url.searchParams.set("month", month);
        window.history.replaceState(null, "", url.toString());

        renderTable(data, id);
    } catch (err) {
        const tbody = document.querySelector("#attendance-table tbody");
        if (tbody) tbody.innerHTML =
            `<tr><td colspan="10" class="text-danger text-center py-3">${err.message}</td></tr>`;
    }
}

let _justCtx = null;
let _justEvidenceObjectUrl = null;

function releaseJustificationEvidenceObjectUrl() {
    if (!_justEvidenceObjectUrl) return;
    URL.revokeObjectURL(_justEvidenceObjectUrl);
    _justEvidenceObjectUrl = null;
}

document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-bs-target='#justModal']");
    if (!btn) return;
    const student = _historyData?.alumnos?.find(item => String(item.user_id) === String(btn.dataset.user));
    const record = student?.asistencias?.[btn.dataset.date] || null;
    _justCtx = {
        userId: btn.dataset.user,
        dateKey: btn.dataset.date,
        courseId: btn.dataset.course,
        record
    };

    const studentName = btn.closest("tr")?.querySelector("td.fw-semibold")?.textContent || "—";
    const [y, m, d] = (btn.dataset.date || "").split("-");
    const fechaFmt = d ? `${d}/${m}/${y}` : btn.dataset.date;
    const request = record?.justification_request || null;

    const studentEl = document.getElementById("justStudent");
    const dateEl = document.getElementById("justDate");
    const statusEl = document.getElementById("justStatus");
    const courseEl = document.getElementById("justCourse");
    const justifyEl = document.getElementById("justifyConfirm");
    const aiPanelEl = document.getElementById("justifyAiPanel");
    const textEl = document.getElementById("justifyText");
    const confirmBtn = document.getElementById("confirmJustify");
    const rejectBtn = document.getElementById("rejectJustify");
    const feedbackEl = document.getElementById("justifyFeedback");
    const originalTextEl = document.getElementById("justOriginalText");
    const aiCategoryEl = document.getElementById("justAiCategory");
    const aiRecommendationEl = document.getElementById("justAiRecommendation");
    const aiConfidenceEl = document.getElementById("justAiConfidence");
    const aiCommentEl = document.getElementById("justAiComment");
    const evidencePanelEl = document.getElementById("justifyEvidencePanel");
    const evidenceImageEl = document.getElementById("justEvidenceImage");
    const evidenceEmptyEl = document.getElementById("justEvidenceEmpty");
    const aiCategory = record?.justification_ai_result || request?.ai_category || null;
    const aiScore = record?.justification_ai_score ?? request?.ai_confidence ?? null;
    const aiComment = record?.justification_ai_comment || request?.ai_comment || null;
    const evidenceUrl = record?.justification_image_url || null;
    const hasReviewData = Boolean(request?.original_text || record?.justification_text || evidenceUrl || aiCategory || aiComment || aiScore != null);

    if (studentEl) studentEl.textContent = studentName;
    if (dateEl) dateEl.textContent = fechaFmt;
    if (statusEl) statusEl.textContent = STATUS_LABEL[record?.display_status || record?.status] || "Inasistencia";
    if (courseEl) courseEl.textContent = _historyData?.curso?.name_subject || `Curso ${btn.dataset.course}`;
    if (justifyEl) justifyEl.classList.remove("d-none");

    if (feedbackEl) {
        feedbackEl.textContent = "";
        feedbackEl.classList.add("d-none");
    }

    releaseJustificationEvidenceObjectUrl();

    if (evidencePanelEl) evidencePanelEl.classList.toggle("d-none", !hasReviewData);
    if (evidenceImageEl) {
        evidenceImageEl.src = "";
        evidenceImageEl.classList.add("d-none");
    }
    if (evidenceEmptyEl) evidenceEmptyEl.textContent = evidenceUrl ? "Cargando evidencia..." : "Sin evidencia adjunta.";

    if (evidenceUrl && evidenceImageEl && evidenceEmptyEl) {
        fetchProtectedEvidenceObjectUrl(evidenceUrl)
            .then(objectUrl => {
                if (!objectUrl) return;
                releaseJustificationEvidenceObjectUrl();
                _justEvidenceObjectUrl = objectUrl;
                evidenceImageEl.src = objectUrl;
                evidenceImageEl.classList.remove("d-none");
                evidenceEmptyEl.textContent = "";
            })
            .catch(() => {
                evidenceImageEl.src = "";
                evidenceImageEl.classList.add("d-none");
                evidenceEmptyEl.textContent = "No se pudo cargar la evidencia.";
            });
    }

    if (hasReviewData) {
        if (aiPanelEl) aiPanelEl.classList.remove("d-none");
        if (originalTextEl) originalTextEl.textContent = request?.original_text || record?.justification_text || "—";
        if (aiCategoryEl) aiCategoryEl.textContent = formatAiCategory(aiCategory);
        if (aiRecommendationEl) aiRecommendationEl.textContent = "revisar";
        if (aiConfidenceEl) aiConfidenceEl.textContent = formatAiConfidence(aiScore);
        if (aiCommentEl) aiCommentEl.textContent = "Se recomienda revisión manual para confirmar la justificación.";
        if (textEl) {
            textEl.value = request?.original_text || record?.justification_text || "";
            textEl.readOnly = true;
        }
        if (confirmBtn) confirmBtn.textContent = "Aceptar justificación";
        if (rejectBtn) rejectBtn.classList.remove("d-none");
    } else {
        if (aiPanelEl) aiPanelEl.classList.add("d-none");
        if (evidencePanelEl) evidencePanelEl.classList.add("d-none");
        if (textEl) {
            textEl.value = "";
            textEl.readOnly = false;
        }
        if (confirmBtn) confirmBtn.textContent = "Justificar";
        if (rejectBtn) rejectBtn.classList.add("d-none");
    }
});

document.getElementById("confirmJustify")?.addEventListener("click", async () => {
    if (!_justCtx) return;

    const textEl = document.getElementById("justifyText");
    const justification_text = textEl ? textEl.value.trim() : "";
    const isAiReview = Boolean(_justCtx.record?.justification_request?.format === "scanq-justification-v1"
        && _justCtx.record?.justification_request?.original_text);
    if (!isAiReview && (!justification_text || justification_text.length < 3)) {
        const fb = document.getElementById("justifyFeedback");
        if (fb) { fb.textContent = "Escribe un motivo (mínimo 3 caracteres)."; fb.classList.remove("d-none"); }
        return;
    }

    const btn = document.getElementById("confirmJustify");
    if (btn) btn.disabled = true;

    try {
        await api("PUT", "/teacher/attendance/justify", {
            user_id: Number(_justCtx.userId),
            id_course: Number(_justCtx.courseId),
            date: String(_justCtx.dateKey),
            action: isAiReview ? "accept" : undefined,
            justification_text: isAiReview ? undefined : justification_text
        });

        const modalEl = document.getElementById("justModal");
        if (modalEl) {
            const instance = bootstrap.Modal.getInstance(modalEl);
            if (instance) instance.hide();
        }

        loadHistory();
    } catch (err) {
        const fb = document.getElementById("justifyFeedback");
        if (fb) { fb.textContent = err.message || "Error al justificar."; fb.classList.remove("d-none"); }
    } finally {
        if (btn) btn.disabled = false;
    }
});

document.getElementById("rejectJustify")?.addEventListener("click", async () => {
    if (!_justCtx?.record?.justification_request?.original_text) return;

    const btn = document.getElementById("rejectJustify");
    if (btn) btn.disabled = true;

    try {
        await api("PUT", "/teacher/attendance/justify", {
            user_id: Number(_justCtx.userId),
            id_course: Number(_justCtx.courseId),
            date: String(_justCtx.dateKey),
            action: "reject"
        });

        const modalEl = document.getElementById("justModal");
        if (modalEl) {
            const instance = bootstrap.Modal.getInstance(modalEl);
            if (instance) instance.hide();
        }

        loadHistory();
    } catch (err) {
        const fb = document.getElementById("justifyFeedback");
        if (fb) { fb.textContent = err.message || "Error al rechazar."; fb.classList.remove("d-none"); }
    } finally {
        if (btn) btn.disabled = false;
    }
});

document.getElementById("cancelJustify")?.addEventListener("click", () => {
    const el = document.getElementById("justifyConfirm");
    if (el) el.classList.add("d-none");
    const textEl = document.getElementById("justifyText");
    if (textEl) textEl.value = "";
    const fb = document.getElementById("justifyFeedback");
    if (fb) { fb.textContent = ""; fb.classList.add("d-none"); }
    _justCtx = null;
});

document.getElementById("justModal")?.addEventListener("hidden.bs.modal", () => {
    const el = document.getElementById("justifyConfirm");
    if (el) el.classList.add("d-none");
    const aiEl = document.getElementById("justifyAiPanel");
    if (aiEl) aiEl.classList.add("d-none");
    const evidenceEl = document.getElementById("justifyEvidencePanel");
    if (evidenceEl) evidenceEl.classList.add("d-none");
    const evidenceImageEl = document.getElementById("justEvidenceImage");
    if (evidenceImageEl) {
        releaseJustificationEvidenceObjectUrl();
        evidenceImageEl.src = "";
        evidenceImageEl.classList.add("d-none");
    }
    const textEl = document.getElementById("justifyText");
    if (textEl) {
        textEl.value = "";
        textEl.readOnly = false;
    }
    const fb = document.getElementById("justifyFeedback");
    if (fb) { fb.textContent = ""; fb.classList.add("d-none"); }
    const btn = document.getElementById("confirmJustify");
    if (btn) btn.disabled = false;
    const rejectBtn = document.getElementById("rejectJustify");
    if (rejectBtn) {
        rejectBtn.disabled = false;
        rejectBtn.classList.add("d-none");
    }
    _justCtx = null;
});

document.addEventListener("DOMContentLoaded", () => {
    if (!getToken()) { logout(); return; }
    if (getStoredUser()?.must_change_password) { redirectToPasswordChange(); return; }

    const table = document.querySelector(".table");
    if (table && !table.id) table.id = "attendance-table";

    const cardBody = document.querySelector(".card-body.p-0");
    if (cardBody && !document.getElementById("month-select")) {
        const sel = document.createElement("div");
        sel.className = "p-3 border-bottom";
        sel.innerHTML = `
      <label class="form-label small fw-bold mb-1">Mes:</label>
      <select id="month-select" class="form-select form-select-sm w-auto d-inline-block">
      </select>`;
        cardBody.prepend(sel);
        document.getElementById("month-select").addEventListener("change", (e) => {
            loadHistory(e.target.value);
        });
    }

    document.getElementById("export-history-btn")?.addEventListener("click", exportHistoryCsv);

    loadHistory();
});
