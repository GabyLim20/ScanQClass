"use strict";

const TOKEN_KEY = "token";
const USER_KEY = "user";

function getToken() { return localStorage.getItem(TOKEN_KEY); }

function getUser() {
    try { return JSON.parse(localStorage.getItem(USER_KEY)); }
    catch { return null; }
}

function saveUser(user) {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
}

function redirectToPasswordChange() {
    window.location.href = "/assets/views/changePassword.html";
}

function logout() {
    localStorage.clear();
    window.location.href = "/assets/views/login.html";
}

async function handleProtectedResponse(res) {
    if (res.status !== 401 && res.status !== 403) return false;

    const data = await res.json().catch(() => ({}));
    if (res.status === 403 && data?.must_change_password) {
        const user = getUser();
        if (user) saveUser({ ...user, must_change_password: true });
        redirectToPasswordChange();
        return true;
    }

    logout();
    return true;
}

function formatMxDate(dateValue) {
    return new Intl.DateTimeFormat("es-MX", {
        timeZone: "America/Mexico_City",
        day: "numeric",
        month: "long",
        year: "numeric"
    }).format(new Date(dateValue));
}

function formatMxDateTime(dateValue) {
    return new Intl.DateTimeFormat("es-MX", {
        timeZone: "America/Mexico_City",
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    }).format(new Date(dateValue));
}

function isAttendanceCredit(status) {
    return status === "present" || status === "late" || status === "justified";
}

function getDisplayStatus(row) {
    return row?.display_status || row?.status;
}

let _notifications = [];

let _qrCountdownInterval = null;
let _qrAutoRenewTimer = null;

document.addEventListener("DOMContentLoaded", () => {
    if (!getToken()) { logout(); return; }
    if (getUser()?.must_change_password) { redirectToPasswordChange(); return; }

    const user = getUser();
    const nameEl = document.getElementById("student-name");
    if (nameEl && user) {
        const nombre = user.name || user.nombre || user.email || "Alumno";
        nameEl.textContent = `Hola, ${nombre}`;
    }

    document.getElementById("qr-btn")
        ?.addEventListener("click", showQr);
    document.getElementById("qr-renew-btn")
        ?.addEventListener("click", showQr);

    document.getElementById("student-logout-btn")
        ?.addEventListener("click", logout);

    document.getElementById("notifications-list")
        ?.addEventListener("click", async (e) => {
            const btn = e.target.closest(".notification-item");
            if (!btn) return;
            await markNotificationAsRead(btn.dataset.id);
        });

    document.getElementById("history-btn")
        ?.addEventListener("click", () => {
            loadHistory();
            document.getElementById("history-section")
                ?.scrollIntoView({ behavior: "smooth", block: "start" });
        });

    document.getElementById("attendance-list")
        ?.addEventListener("click", (e) => {
            const btn = e.target.closest(".justify-btn");
            if (!btn) return;
            openJustifyModal(btn.dataset.id, btn.dataset.date);
        });

    document.getElementById("just-submit-btn")
        ?.addEventListener("click", submitJustification);

    loadNotifications();
    loadHistory();
});

async function loadNotifications() {
    const listEl = document.getElementById("notifications-list");
    const badgeEl = document.getElementById("notifications-badge");
    if (!listEl || !badgeEl) return;

    try {
        const res = await fetch("/student/notifications", {
            headers: { "Authorization": `Bearer ${getToken()}` }
        });

        if (await handleProtectedResponse(res)) return;

        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `Error ${res.status}`);

        _notifications = Array.isArray(data.items) ? data.items : [];
        const unread = Number(data.unread_count || 0);
        badgeEl.textContent = String(unread);
        badgeEl.classList.toggle("d-none", unread <= 0);

        if (!_notifications.length) {
            listEl.innerHTML = `<div class="px-3 py-3 text-muted small">Sin notificaciones.</div>`;
            return;
        }

        listEl.innerHTML = _notifications.map(item => `
      <button type="button" class="dropdown-item notification-item ${item.is_read ? "" : "notification-unread"}"
        data-id="${item.id}">
        <div class="fw-semibold">${item.title || "Notificación"}</div>
        <div class="small text-muted">${item.message || ""}</div>
        <div class="small text-muted mt-1">${item.created_at ? formatMxDateTime(item.created_at) : "—"}</div>
      </button>
    `).join("");
    } catch (err) {
        listEl.innerHTML = `<div class="px-3 py-3 text-danger small">${err.message || "No se pudieron cargar las notificaciones."}</div>`;
    }
}

async function markNotificationAsRead(id) {
    if (!id) return;
    try {
        const res = await fetch(`/student/notifications/${id}/read`, {
            method: "PUT",
            headers: {
                "Authorization": `Bearer ${getToken()}`,
                "Content-Type": "application/json"
            }
        });

        if (await handleProtectedResponse(res)) return;
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `Error ${res.status}`);

        _notifications = _notifications.map(item => (
            String(item.id) === String(id) ? { ...item, is_read: true } : item
        ));
        loadNotifications();
    } catch (err) {
        console.error("markNotificationAsRead error:", err);
    }
}


function clearQrTimers() {
    if (_qrCountdownInterval !== null) {
        clearInterval(_qrCountdownInterval);
        _qrCountdownInterval = null;
    }
    if (_qrAutoRenewTimer !== null) {
        clearTimeout(_qrAutoRenewTimer);
        _qrAutoRenewTimer = null;
    }
}

function formatCountdown(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * @param {number} expiresIn - Segundos de vigencia 
 */
function startQrCountdown(expiresIn) {
    clearQrTimers();

    const timerEl = document.getElementById("qr-timer");
    const valueEl = document.getElementById("qr-countdown-value");
    const warningEl = document.getElementById("qr-warning");
    const expiredEl = document.getElementById("qr-expired");
    const expiredMsg = document.getElementById("qr-expired-msg");
    const imgWrapper = document.getElementById("qr-img-wrapper");

    if (timerEl) timerEl.classList.remove("d-none");
    if (warningEl) warningEl.classList.add("d-none");
    if (expiredEl) expiredEl.classList.add("d-none");
    if (imgWrapper) imgWrapper.classList.remove("opacity-50");

    if (valueEl) valueEl.textContent = formatCountdown(expiresIn);

    let remaining = expiresIn;

    _qrCountdownInterval = setInterval(() => {
        remaining -= 1;
        if (remaining < 0) remaining = 0;

        if (valueEl) valueEl.textContent = formatCountdown(remaining);

        if (remaining <= 30 && remaining > 0) {
            if (warningEl) warningEl.classList.remove("d-none");
        }

        if (remaining <= 0) {
            clearQrTimers();
            if (timerEl) timerEl.classList.add("d-none");
            if (warningEl) warningEl.classList.add("d-none");
            if (imgWrapper) imgWrapper.classList.add("opacity-50");
            if (expiredMsg) expiredMsg.innerHTML =
                '<i class="bi bi-x-circle me-1"></i>QR expirado, da click para generar uno nuevo';
            if (expiredEl) expiredEl.classList.remove("d-none");
        }
    }, 1000);

    const autoRenewIn = expiresIn > 30 ? (expiresIn - 30) * 1000 : null;
    if (autoRenewIn !== null) {
        _qrAutoRenewTimer = setTimeout(() => {
            _qrAutoRenewTimer = null;
            showQr();
        }, autoRenewIn);
    }
}

async function showQr() {
    const token = getToken();
    const user = getUser();

    if (!token || !user?.id) { logout(); return; }

    clearQrTimers();

    const btn = document.getElementById("qr-btn");
    if (btn) { btn.disabled = true; btn.textContent = "Generando…"; }

    try {
        const res = await fetch(`/qr/student/${user.id}`, {
            headers: { "Authorization": `Bearer ${token}` }
        });

        if (await handleProtectedResponse(res)) return;

        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `Error ${res.status}`);

        const container = document.getElementById("qr-container");
        const img = document.getElementById("qr-img");
        if (container && img) {
            img.src = data.qr_data_url;
            container.classList.remove("d-none");
            container.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }

        const expiresIn = Number(data.expires_in) > 0 ? Number(data.expires_in) : 60;
        startQrCountdown(expiresIn);

    } catch (err) {
        console.error("showQr error:", err);

        const container = document.getElementById("qr-container");
        const timerEl = document.getElementById("qr-timer");
        const expiredEl = document.getElementById("qr-expired");
        const expiredMsg = document.getElementById("qr-expired-msg");
        const imgWrapper = document.getElementById("qr-img-wrapper");

        if (container) container.classList.remove("d-none");
        if (timerEl) timerEl.classList.add("d-none");
        if (imgWrapper) imgWrapper.classList.add("opacity-50");
        if (expiredMsg) expiredMsg.innerHTML =
            '<i class="bi bi-x-circle me-1"></i>No se pudo generar el QR. Intenta nuevamente.';
        if (expiredEl) expiredEl.classList.remove("d-none");
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="bi bi-qr-code me-1"></i> Mi código QR';
        }
    }
}

async function loadHistory() {
    const list = document.getElementById("attendance-list");
    if (!list) return;

    const token = getToken();
    const user = getUser();
    if (!token || !user?.id) { logout(); return; }

    list.innerHTML = `
    <li class="list-group-item text-center text-muted py-3">
      Cargando historial…
    </li>`;

    try {
        const res = await fetch(`/student/attendance`, {
            headers: { "Authorization": `Bearer ${token}` }
        });

        if (await handleProtectedResponse(res)) return;

        const rows = await res.json().catch(() => []);
        if (!res.ok) throw new Error(rows.error || `Error ${res.status}`);

        renderHistory(rows);
    } catch (err) {
        console.error("loadHistory error:", err);
        list.innerHTML = `
      <li class="list-group-item text-center text-danger py-3">
        No se pudo cargar el historial.
      </li>`;
    }
}

function renderHistory(rows) {
    const list = document.getElementById("attendance-list");
    if (!list) return;
    renderStudentAlerts(rows);

    if (!rows.length) {
        list.innerHTML = `<li class="list-group-item text-center text-muted py-3">Sin registros de asistencia.</li>`;
        return;
    }

    const STATUS_ICON = {
        present: `<i class="bi bi-check-lg text-success"></i>`,
        absent: `<i class="bi bi-x-lg text-danger"></i>`,
        late: `<i class="bi bi-clock text-warning"></i>`,
        pending: `<i class="bi bi-hourglass-split text-warning"></i>`,
        justified: `<i class="bi bi-patch-check text-primary"></i>`
    };

    const STATUS_LABEL = {
        present: "Presente",
        absent: "Inasistencia",
        late: "Retardo",
        pending: "Pendiente de justificación",
        justified: "Justificada"
    };

    const total = rows.length;
    const present = rows.filter(r => isAttendanceCredit(getDisplayStatus(r))).length;
    const absent = rows.filter(r => getDisplayStatus(r) === "absent" || getDisplayStatus(r) === "pending").length;
    const statTotalEl = document.getElementById("stat-total");
    const statPresentEl = document.getElementById("stat-present");
    const statAbsentEl = document.getElementById("stat-absent");

    if (statTotalEl) statTotalEl.textContent = total;
    if (statPresentEl) statPresentEl.textContent = present;
    if (statAbsentEl) statAbsentEl.textContent = absent;

    list.innerHTML = rows.map(row => {
        const courseName = row.course?.name_subject || `Curso ${row.id_course ?? "—"}`;
        const date = row.date ? formatMxDate(row.date) : "—";
        const visualStatus = getDisplayStatus(row);
        const icon = STATUS_ICON[visualStatus] || STATUS_ICON.absent;
        const label = STATUS_LABEL[visualStatus] || visualStatus;
        const reviewStatus = row.justification_request?.review_status || null;
        const reviewLabel = reviewStatus === "pending"
            ? `<small class="text-warning d-block">Solicitud enviada al maestro</small>`
            : reviewStatus === "rejected"
                ? `<small class="text-danger d-block">Solicitud rechazada</small>`
                : reviewStatus === "accepted"
                    ? `<small class="text-primary d-block">Solicitud aceptada</small>`
                    : "";
        const justifyBtn = visualStatus === "absent"
            ? `<button class="btn btn-outline-secondary btn-sm justify-btn"
           data-id="${row.id_attendance}"
           data-date="${date}">Solicitar justificación</button>`
            : "";

        return `
      <li class="list-group-item d-flex align-items-center justify-content-between attendance-item">
        <div class="d-flex align-items-center gap-3">
          <div class="flex-shrink-0">${icon}</div>
          <div>
            <p class="mb-0 fw-bold">${courseName}</p>
            <small class="text-secondary d-block">${date}</small>
            <small class="text-secondary">${label}</small>
            ${reviewLabel}
          </div>
        </div>
        ${justifyBtn}
      </li>`;
    }).join("");
}

function renderStudentAlerts(rows) {
    const alertsEl = document.getElementById("student-alerts");
    if (!alertsEl) return;

    const absences = (rows || []).filter(row => {
        const visualStatus = getDisplayStatus(row);
        return visualStatus === "absent" || visualStatus === "pending";
    });
    if (!absences.length) {
        alertsEl.innerHTML = "";
        return;
    }

    const latestAbsence = absences[0];
    const latestCourse = latestAbsence?.course?.name_subject || `Curso ${latestAbsence?.id_course ?? "—"}`;
    alertsEl.innerHTML = `
    <div class="alert alert-warning border-0 shadow-sm student-alert-card mb-0">
      <div class="d-flex flex-column flex-md-row justify-content-between gap-2">
        <div>
          <strong>Notificación de inasistencia</strong>
          <div class="small mt-1">Tienes ${absences.length} inasistencia${absences.length === 1 ? "" : "s"} registrada${absences.length === 1 ? "" : "s"}.</div>
          <div class="small text-muted">Última falta: ${latestCourse} · ${latestAbsence?.date ? formatMxDate(latestAbsence.date) : "—"}</div>
        </div>
        <div class="small text-muted">Si consideras que aplica, puedes enviar tu solicitud de justificación.</div>
      </div>
    </div>
  `;
}


let _justAttendanceId = null;
let _justModalInstance = null;

function openJustifyModal(attendanceId, dateLabel) {
    _justAttendanceId = attendanceId;

    const dateEl = document.getElementById("just-date-label");
    if (dateEl) dateEl.textContent = dateLabel || "—";

    const textEl = document.getElementById("just-text");
    if (textEl) textEl.value = "";
    const imageEl = document.getElementById("just-image");
    if (imageEl) imageEl.value = "";

    const fbEl = document.getElementById("just-feedback");
    if (fbEl) { fbEl.textContent = ""; fbEl.className = "small mt-2 d-none"; }

    const modalEl = document.getElementById("justify-modal");
    if (!modalEl) return;
    _justModalInstance = bootstrap.Modal.getOrCreateInstance(modalEl);
    _justModalInstance.show();
}

async function submitJustification() {
    const text = document.getElementById("just-text")?.value.trim();
    const imageFile = document.getElementById("just-image")?.files?.[0] || null;
    const fbEl = document.getElementById("just-feedback");
    const btn = document.getElementById("just-submit-btn");

    if (!text || text.length < 3) {
        if (fbEl) {
            fbEl.textContent = "Escribe un motivo (mínimo 3 caracteres).";
            fbEl.className = "small mt-2 text-danger";
        }
        return;
    }

    if (!_justAttendanceId) {
        if (fbEl) {
            fbEl.textContent = "No se encontró la asistencia a justificar.";
            fbEl.className = "small mt-2 text-danger";
        }
        return;
    }

    if (btn) btn.disabled = true;

    try {
        const formData = new FormData();
        formData.append("attendance_id", String(Number(_justAttendanceId)));
        formData.append("justification_text", text);
        if (imageFile) formData.append("justification_image", imageFile);

        const res = await fetch("/student/attendance/justify-request", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${getToken()}`
            },
            body: formData
        });

        if (await handleProtectedResponse(res)) return;

        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `Error ${res.status}`);

        if (fbEl) {
            fbEl.textContent = data.message || "Solicitud enviada correctamente.";
            fbEl.className = "small mt-2 text-success";
        }

        setTimeout(() => {
            if (_justModalInstance) _justModalInstance.hide();
            loadHistory();
        }, 700);
    } catch (err) {
        if (fbEl) {
            fbEl.textContent = err.message || "No se pudo enviar la solicitud.";
            fbEl.className = "small mt-2 text-danger";
        }
    } finally {
        if (btn) btn.disabled = false;
    }
}
