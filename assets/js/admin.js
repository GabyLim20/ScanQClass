"use strict";

const TOKEN_KEY = "token";
const USER_KEY = "user";

function getToken() {
    return localStorage.getItem(TOKEN_KEY);
}

function authHeaders() {
    return {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${getToken()}`
    };
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

function normalizeIsSuperAdmin(value) {
    return value === true || value === 1 || value === "1";
}

function isSuperAdmin() {
    return normalizeIsSuperAdmin(getStoredUser()?.is_super_admin);
}

function canManageAdminResources() {
    return isSuperAdmin();
}

function showPermissionDenied() {
    toast("No tienes permiso para realizar esta acción", "warning");
}

function redirectToPasswordChange() {
    window.location.href = "/assets/views/changePassword.html";
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
        if (data?.error) {
            throw new Error(data.error);
        }
        throw new Error("No tienes permiso para realizar esta acción");
    }

    if (res.status === 401) {
        logout();
        return null;
    }

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
    return data;
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

async function loadDashboard() {
    try {
        const data = await api("GET", "/admin/dashboard");
        if (!data) return;
        document.getElementById("stat-students").textContent = data.totalStudents ?? "—";
        document.getElementById("stat-teachers").textContent = data.totalTeachers ?? "—";
        document.getElementById("stat-classes").textContent = data.totalCourses ?? "—";
        document.getElementById("stat-enrollments").textContent = data.totalEnrollments ?? "—";
        renderFeaturedTeachers(data.featuredTeachers || []);
        renderUpcomingClass(data.upcomingClass || null);
    } catch (err) {
        console.error("loadDashboard:", err);
    }
}

function renderAdminSidebarProfile() {
    const user = getStoredUser();
    const fullName = `${user?.name || ""} ${user?.lastname || ""}`.trim() || "Administrador";
    const email = user?.email || "admin@sems.com";
    const nameEl = document.getElementById("admin-sidebar-name");
    const emailEl = document.getElementById("admin-sidebar-email");
    if (nameEl) nameEl.textContent = fullName;
    if (emailEl) emailEl.textContent = email;
}

function renderFeaturedTeachers(teachers) {
    const container = document.getElementById("featured-teachers-list");
    if (!container) return;

    if (!Array.isArray(teachers) || teachers.length === 0) {
        container.innerHTML = '<div class="col-12 text-muted small">Sin maestros destacados.</div>';
        return;
    }

    container.innerHTML = teachers.map((teacher) => `
    <div class="col-sm-6">
      <div class="d-flex align-items-center p-3 border rounded-4 bg-light-hover">
        <img src="https://ui-avatars.com/api/?name=${encodeURIComponent(teacher.name || "Maestro")}&background=9947eb&color=fff" class="rounded-circle border border-primary me-3" width="48" height="48">
        <div class="overflow-hidden">
          <h6 class="mb-0 fw-bold text-truncate">${escapeHtml(teacher.name || "Maestro")}</h6>
          <p class="x-small text-muted mb-0 text-truncate">${escapeHtml(teacher.primaryCourse || "Sin clase asignada")} · ${Number(teacher.courseCount || 0)} curso(s)</p>
        </div>
      </div>
    </div>
  `).join("");
}

function renderUpcomingClass(item) {
    const timeEl = document.getElementById("dashboard-upcoming-time");
    const nameEl = document.getElementById("dashboard-upcoming-name");
    const metaEl = document.getElementById("dashboard-upcoming-meta");
    if (!timeEl || !nameEl || !metaEl) return;

    if (!item) {
        timeEl.textContent = "—";
        nameEl.textContent = "Sin clases próximas";
        metaEl.textContent = "Sin horarios disponibles";
        return;
    }

    timeEl.textContent = item.schedule_label || "Horario no disponible";
    nameEl.textContent = item.name_subject || "Clase sin nombre";
    metaEl.textContent = `${item.section_name || "Sin sección"} • ${Number(item.enrollment_count || 0)} inscritos`;
}

let _catalogs = null;
let _sections = null;
let _subjects = null;
let riskLevelChart = null;
let riskSectionChart = null;
let riskStatisticsItems = [];

function getStudentsSearchValue() {
    return String(document.getElementById("students-search")?.value || "").trim().toLowerCase();
}

function getStatisticsSearchValue() {
    return String(document.getElementById("statistics-student-search")?.value || "").trim().toLowerCase();
}

async function getCatalogs() {
    if (!canManageAdminResources()) return null;
    if (!_catalogs) _catalogs = await api("GET", "/admin/catalogs");
    return _catalogs;
}

async function getSections() {
    if (!canManageAdminResources()) return [];
    if (!_sections) _sections = await api("GET", "/admin/sections");
    return _sections;
}

async function getSubjects() {
    if (!canManageAdminResources()) return [];
    if (!_subjects) _subjects = await api("GET", "/admin/subjects");
    return _subjects;
}

function getCurrentMonthValue() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

async function uploadExcelStudents(file, id_section) {
    if (!canManageAdminResources()) {
        throw new Error("No tienes permiso para realizar esta acción");
    }
    const fd = new FormData();
    fd.append("file", file);
    if (id_section) fd.append("id_section", id_section);

    const res = await fetch("/admin/upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}` },
        body: fd
    });

    if (res.status === 403) {
        const data = await res.json().catch(() => ({}));
        if (data?.must_change_password) {
            const user = getStoredUser();
            if (user) saveStoredUser({ ...user, must_change_password: true });
            redirectToPasswordChange();
            return null;
        }
        throw new Error(data?.error || "No tienes permiso para realizar esta acción");
    }

    if (res.status === 401) {
        logout();
        return null;
    }

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
    return data;
}

let students = [];

async function loadStudents() {
    try {
        students = await api("GET", "/admin/getStudent") || [];
        if (canManageAdminResources()) {
            await populateExcelSections();
        }
        renderStudents();
    } catch (err) {
        toast(err.message, "danger");
    }
}

async function populateExcelSections() {
    const select = document.getElementById("excel-section");
    if (!select) return;
    const sections = await getSections();
    select.innerHTML = '<option value="">Seleccionar sección (opcional si el Excel usa hojas por sección)</option>' + (sections || []).map(sec =>
        `<option value="${sec.id_section}">${sec.name}</option>`
    ).join("");
}

async function handleExcelUpload() {
    const fileInput = document.getElementById("excel-file");
    const sectionSelect = document.getElementById("excel-section");
    const result = document.getElementById("excel-result");
    if (!fileInput || !sectionSelect || !result) return;

    const file = fileInput.files?.[0];
    const id_section = sectionSelect.value;

    if (!file) {
        result.innerHTML = '<span class="text-danger">Selecciona un archivo Excel.</span>';
        return;
    }

    result.innerHTML = '<span class="text-muted">Procesando archivo…</span>';

    try {
        const data = await uploadExcelStudents(file, id_section);
        const created = Number(data?.created || 0);
        const linked = Number(data?.linked || 0);
        const skipped = Number(data?.skipped || 0);
        const errors = Array.isArray(data?.errors) ? data.errors : [];
        const initialPasswords = Array.isArray(data?.initialPasswords) ? data.initialPasswords : [];
        const previewErrors = errors.slice(0, 10).map(err => {
            const sheet = err?.sheet ? `${err.sheet}` : "Hoja desconocida";
            const row = err?.row ? ` fila ${err.row}` : "";
            const reason = err?.error || "Error no especificado.";
            return `<li>${sheet}${row}: ${reason}</li>`;
        }).join("");
        const passwordRows = initialPasswords.map(item => `
      <tr>
        <td>${escapeHtml(item.name || "—")}</td>
        <td>${escapeHtml(item.student_code || "—")}</td>
        <td>${escapeHtml(item.email || "—")}</td>
        <td><code>${escapeHtml(item.password || "")}</code></td>
      </tr>
    `).join("");
        result.innerHTML = `
      <div class="row g-2">
        <div class="col-sm-6 col-lg-3"><div class="fw-bold text-success">Creados: ${created}</div></div>
        <div class="col-sm-6 col-lg-3"><div class="fw-bold text-primary">Agregados a sección: ${linked}</div></div>
        <div class="col-sm-6 col-lg-3"><div class="fw-bold text-muted">Omitidos: ${skipped}</div></div>
        <div class="col-sm-6 col-lg-3"><div class="fw-bold text-danger">Errores: ${errors.length}</div></div>
      </div>
      <div class="text-muted mt-1">Total filas procesadas: ${data?.total ?? 0}</div>
      ${errors.length ? `
        <ul class="mt-2 mb-1 ps-3 text-danger small">${previewErrors}</ul>
        ${errors.length > 10 ? `<div class="small text-muted">y ${errors.length - 10} errores más…</div>` : ""}
      ` : ""}
      ${initialPasswords.length ? `
        <div class="mt-3">
          <div class="fw-bold small mb-2">Contraseñas iniciales generadas</div>
          <div class="table-responsive">
            <table class="table table-sm table-bordered align-middle mb-0">
              <thead class="table-light">
                <tr>
                  <th>Alumno</th>
                  <th>Código</th>
                  <th>Correo</th>
                  <th>Contraseña inicial</th>
                </tr>
              </thead>
              <tbody>${passwordRows}</tbody>
            </table>
          </div>
        </div>
      ` : ""}
    `;
        fileInput.value = "";
        await loadStudents();
    } catch (err) {
        result.innerHTML = `<span class="text-danger">${err.message}</span>`;
    }
}

function renderStudents() {
    const tbody = document.getElementById("students-tbody");
    if (!tbody) return;
    const isSuper = canManageAdminResources();
    const searchValue = getStudentsSearchValue();
    const filteredStudents = !searchValue ? students : students.filter((s) => {
        const info = s.studentInfo || {};
        const profile = s.profile || {};
        const section = info.section || {};
        const haystacks = [
            `${profile.name || ""} ${profile.lastname || ""}`.trim(),
            s.email,
            info.student_code,
            section.name
        ]
            .map((value) => String(value || "").toLowerCase())
            .filter(Boolean);

        return haystacks.some((value) => value.includes(searchValue));
    });

    if (!filteredStudents.length) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted py-3">No se encontraron alumnos con esa búsqueda.</td></tr>`;
        return;
    }

    tbody.innerHTML = filteredStudents.map(s => {
        const info = s.studentInfo || {};
        const profile = s.profile || {};
        const section = info.section || {};
        return `
      <tr>
        <td>${profile.name || ""} ${profile.lastname || ""}</td>
        <td>${s.email}</td>
        <td>${info.student_code || "—"}</td>
        <td>${section.name || "—"}</td>
        <td>${info.status || "—"}</td>
        <td>
          <button class="btn btn-sm btn-outline-secondary me-1" onclick="openStudentHistory(${s.id})" title="Historial" aria-label="Historial">
            <i class="bi bi-clock-history"></i>
          </button>
          ${isSuper ? `
            <button class="btn btn-sm btn-outline-primary me-1" onclick="openEditStudent(${s.id})" title="Editar">
              <i class="bi bi-pencil"></i>
            </button>
            <button class="btn btn-sm btn-outline-danger" onclick="confirmDeleteStudent(${s.id})" title="Eliminar">
              <i class="bi bi-trash"></i>
            </button>
          ` : ""}
        </td>
      </tr>`;
    }).join("");
}

function openStudentHistory(id) {
    if (!id) return;
    const currentSection = String(window.location.hash || "").replace("#", "");
    const fromSection = currentSection || "students";
    window.location.href = `/assets/views/admin/student-history.html?id=${encodeURIComponent(id)}&from=${encodeURIComponent(fromSection)}`;
}

async function openEditStudent(id) {
    if (!canManageAdminResources()) {
        showPermissionDenied();
        return;
    }
    const s = students.find(x => x.id === id);
    if (!s) return;
    const info = s.studentInfo || {};
    const profile = s.profile || {};
    const sections = await getSections();

    const sectionOpts = (sections || []).map(sec =>
        `<option value="${sec.id_section}" ${info.id_section === sec.id_section ? "selected" : ""}>${sec.name}</option>`
    ).join("");

    showModal("Editar Alumno", `
    <input id="f-name"     class="form-control mb-2" placeholder="Nombre"   value="${profile.name || ""}">
    <input id="f-lastname" class="form-control mb-2" placeholder="Apellidos" value="${profile.lastname || ""}">
    <input id="f-email"    class="form-control mb-2" placeholder="Correo"   value="${s.email}">
    <input id="f-code"     class="form-control mb-2" placeholder="Código"   value="${info.student_code || ""}">
    <select id="f-section" class="form-select mb-2"><option value="">Sección</option>${sectionOpts}</select>
  `, async () => {
        const body = {
            name: document.getElementById("f-name").value.trim(),
            lastname: document.getElementById("f-lastname").value.trim(),
            email: document.getElementById("f-email").value.trim(),
            student_code: document.getElementById("f-code").value.trim(),
            id_section: document.getElementById("f-section").value
        };
        try {
            await api("PUT", `/admin/updateStudent/${id}`, body);
            toast("Alumno actualizado");
            loadStudents();
        } catch (err) { toast(err.message, "danger"); }
    });
}

async function openCreateStudent() {
    if (!canManageAdminResources()) {
        showPermissionDenied();
        return;
    }
    const sections = await getSections();
    const sectionOpts = (sections || []).map(sec =>
        `<option value="${sec.id_section}">${sec.name}</option>`
    ).join("");

    showModal("Nuevo Alumno", `
    <input id="f-name"     class="form-control mb-2" placeholder="Nombre">
    <input id="f-lastname" class="form-control mb-2" placeholder="Apellidos">
    <input id="f-email"    class="form-control mb-2" placeholder="correo@alumnos.udg.mx">
    <input id="f-code"     class="form-control mb-2" placeholder="Código de estudiante">
    <select id="f-section" class="form-select mb-2"><option value="">Sección</option>${sectionOpts}</select>
  `, async () => {
        const body = {
            name: document.getElementById("f-name").value.trim(),
            lastname: document.getElementById("f-lastname").value.trim(),
            email: document.getElementById("f-email").value.trim(),
            student_code: document.getElementById("f-code").value.trim(),
            id_section: document.getElementById("f-section").value
        };
        try {
            const res = await api("POST", "/admin/createStudent", body);
            toast(`Alumno creado. Contraseña: ${res.alumno?.contraseña}`);
            loadStudents();
        } catch (err) { toast(err.message, "danger"); }
    });
}

function confirmDeleteStudent(id) {
    if (!canManageAdminResources()) {
        showPermissionDenied();
        return;
    }
    const s = students.find(x => x.id === id);
    const nombre = s?.profile ? `${s.profile.name} ${s.profile.lastname}` : `ID ${id}`;
    showModal("Eliminar Alumno",
        `<p>¿Eliminar a <strong>${nombre}</strong>? Esta acción no se puede deshacer.</p>`,
        async () => {
            try {
                await api("DELETE", `/admin/deleteStudent/${id}`);
                toast("Alumno eliminado");
                loadStudents();
            } catch (err) { toast(err.message, "danger"); }
        }, "danger"
    );
}

let teachers = [];

async function loadTeachers() {
    if (!canManageAdminResources()) return;
    try {
        teachers = await api("GET", "/admin/getTeacher") || [];
        renderTeachers();
    } catch (err) {
        toast(err.message, "danger");
    }
}

function renderTeachers() {
    const tbody = document.getElementById("teachers-tbody");
    if (!tbody) return;
    tbody.innerHTML = teachers.map(t => {
        const profile = t.profile || {};
        const courses = (t.teacherCourses || []).map(c => c.course?.name_subject || "").filter(Boolean).join(", ");
        return `
      <tr>
        <td>${profile.name || ""} ${profile.lastname || ""}</td>
        <td>${t.email}</td>
        <td class="text-truncate" style="max-width:200px">${courses || "—"}</td>
        <td>
          <button class="btn btn-sm btn-outline-primary me-1" onclick="openEditTeacher(${t.id})">
            <i class="bi bi-pencil"></i>
          </button>
          <button class="btn btn-sm btn-outline-danger" onclick="confirmDeleteTeacher(${t.id})">
            <i class="bi bi-trash"></i>
          </button>
        </td>
      </tr>`;
    }).join("");
}

async function buildCourseCheckboxes(selectedIds = []) {
    let courses = [];
    try { courses = await api("GET", "/admin/getClasses") || []; } catch (_) { }
    return courses.map(c =>
        `<div class="form-check">
       <input class="form-check-input course-check" type="checkbox" value="${c.id_course}"
         id="cc-${c.id_course}" ${selectedIds.includes(c.id_course) ? "checked" : ""}>
       <label class="form-check-label" for="cc-${c.id_course}">${c.name_subject}</label>
     </div>`
    ).join("");
}

async function openCreateTeacher() {
    if (!canManageAdminResources()) {
        showPermissionDenied();
        return;
    }
    const checkboxes = await buildCourseCheckboxes();
    showModal("Nuevo Maestro", `
    <input id="f-name"     class="form-control mb-2" placeholder="Nombre">
    <input id="f-lastname" class="form-control mb-2" placeholder="Apellidos">
    <input id="f-email"    class="form-control mb-2" placeholder="correo@academicos.udg.mx">
    <p class="mb-1 small fw-bold">Cursos asignados:</p>
    <div id="f-courses">${checkboxes}</div>
  `, async () => {
        const courses = [...document.querySelectorAll(".course-check:checked")].map(el => Number(el.value));
        const body = {
            name: document.getElementById("f-name").value.trim(),
            lastname: document.getElementById("f-lastname").value.trim(),
            email: document.getElementById("f-email").value.trim(),
            courses
        };
        try {
            const res = await api("POST", "/admin/createTeacher", body);
            toast(`Maestro creado. Contraseña: ${res.maestro?.contraseña}`);
            loadTeachers();
        } catch (err) { toast(err.message, "danger"); }
    });
}

async function openEditTeacher(id) {
    if (!canManageAdminResources()) {
        showPermissionDenied();
        return;
    }
    const t = teachers.find(x => x.id === id);
    if (!t) return;
    const profile = t.profile || {};
    const selectedIds = (t.teacherCourses || []).map(c => c.id_course);
    const checkboxes = await buildCourseCheckboxes(selectedIds);

    showModal("Editar Maestro", `
    <input id="f-name"     class="form-control mb-2" placeholder="Nombre"    value="${profile.name || ""}">
    <input id="f-lastname" class="form-control mb-2" placeholder="Apellidos" value="${profile.lastname || ""}">
    <input id="f-email"    class="form-control mb-2" placeholder="Correo"    value="${t.email}">
    <p class="mb-1 small fw-bold">Cursos asignados:</p>
    <div id="f-courses">${checkboxes}</div>
  `, async () => {
        const courses = [...document.querySelectorAll(".course-check:checked")].map(el => Number(el.value));
        const body = {
            name: document.getElementById("f-name").value.trim(),
            lastname: document.getElementById("f-lastname").value.trim(),
            email: document.getElementById("f-email").value.trim(),
            courses
        };
        try {
            await api("PUT", `/admin/updateTeacher/${id}`, body);
            toast("Maestro actualizado");
            loadTeachers();
        } catch (err) { toast(err.message, "danger"); }
    });
}

function confirmDeleteTeacher(id) {
    if (!canManageAdminResources()) {
        showPermissionDenied();
        return;
    }
    const t = teachers.find(x => x.id === id);
    const nombre = t?.profile ? `${t.profile.name} ${t.profile.lastname}` : `ID ${id}`;
    showModal("Eliminar Maestro",
        `<p>¿Eliminar a <strong>${nombre}</strong>?</p>`,
        async () => {
            try {
                await api("DELETE", `/admin/deleteTeacher/${id}`);
                toast("Maestro eliminado");
                loadTeachers();
            } catch (err) { toast(err.message, "danger"); }
        }, "danger"
    );
}

let classes = [];

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

function getClassSectionLabel(c) {
    return c.section?.name || "—";
}

function getClassSchedulesText(c) {
    if (Array.isArray(c.schedules) && c.schedules.length > 0) {
        return c.schedules
            .map(s => `${s.day_of_week}: ${String(s.start_time || "").slice(0, 5)}-${String(s.end_time || "").slice(0, 5)}`)
            .join("<br>");
    }

    return "Sin horario asignado";
}

function getTeacherDisplayName(teacher) {
    const fullName = `${teacher?.profile?.name || ""} ${teacher?.profile?.lastname || ""}`.trim();
    return fullName || teacher?.email || `ID ${teacher?.id ?? "—"}`;
}

function buildScheduleRows(rows = []) {
    const source = Array.isArray(rows) && rows.length > 0
        ? rows
        : [{ day_of_week: "", start_time: "", end_time: "" }];

    return source.map((row, index) => `
    <div class="row g-2 align-items-end schedule-row mb-2" data-index="${index}">
      <div class="col-md-4">
        <label class="form-label small mb-1 ${index === 0 ? "" : "d-none"}">Día</label>
        <select class="form-select schedule-day">
          <option value="">Día</option>
          ${["Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado"].map(day =>
        `<option value="${day}" ${row.day_of_week === day ? "selected" : ""}>${day}</option>`
    ).join("")}
        </select>
      </div>
      <div class="col-md-3">
        <label class="form-label small mb-1 ${index === 0 ? "" : "d-none"}">Inicio</label>
        <input class="form-control schedule-start" type="time" value="${escapeHtml(String(row.start_time || "").slice(0, 5))}">
      </div>
      <div class="col-md-3">
        <label class="form-label small mb-1 ${index === 0 ? "" : "d-none"}">Fin</label>
        <input class="form-control schedule-end" type="time" value="${escapeHtml(String(row.end_time || "").slice(0, 5))}">
      </div>
      <div class="col-md-2">
        <button type="button" class="btn btn-outline-danger w-100 remove-schedule ${source.length === 1 ? "d-none" : ""}">
          <i class="bi bi-trash"></i>
        </button>
      </div>
    </div>
  `).join("");
}

function collectSchedulesFromModal() {
    return Array.from(document.querySelectorAll("#schedule-list .schedule-row"))
        .map(row => ({
            day_of_week: row.querySelector(".schedule-day")?.value || "",
            start_time: row.querySelector(".schedule-start")?.value ? `${row.querySelector(".schedule-start").value}:00` : "",
            end_time: row.querySelector(".schedule-end")?.value ? `${row.querySelector(".schedule-end").value}:00` : ""
        }))
        .filter(item => item.day_of_week || item.start_time || item.end_time);
}

function normalizeSchedulesForCompare(rows = []) {
    return (Array.isArray(rows) ? rows : [])
        .map(row => ({
            day_of_week: row?.day_of_week || "",
            start_time: String(row?.start_time || "").slice(0, 8),
            end_time: String(row?.end_time || "").slice(0, 8)
        }))
        .sort((a, b) =>
            `${a.day_of_week}-${a.start_time}-${a.end_time}`.localeCompare(
                `${b.day_of_week}-${b.start_time}-${b.end_time}`
            )
        );
}

function schedulesChanged(currentRows = [], nextRows = []) {
    return JSON.stringify(normalizeSchedulesForCompare(currentRows)) !==
        JSON.stringify(normalizeSchedulesForCompare(nextRows));
}

function wireScheduleEditor() {
    const list = document.getElementById("schedule-list");
    const addBtn = document.getElementById("add-schedule-btn");
    if (!list || !addBtn) return;

    const refreshRemoveButtons = () => {
        const rows = list.querySelectorAll(".schedule-row");
        rows.forEach(btnRow => {
            const btn = btnRow.querySelector(".remove-schedule");
            if (btn) btn.classList.toggle("d-none", rows.length === 1);
        });
    };

    addBtn.addEventListener("click", () => {
        list.insertAdjacentHTML("beforeend", buildScheduleRows([{ day_of_week: "", start_time: "", end_time: "" }]));
        refreshRemoveButtons();
    });

    list.addEventListener("click", e => {
        const btn = e.target.closest(".remove-schedule");
        if (!btn) return;
        btn.closest(".schedule-row")?.remove();
        refreshRemoveButtons();
    });

    refreshRemoveButtons();
}

async function loadClasses() {
    if (!canManageAdminResources()) return;
    try {
        classes = await api("GET", "/admin/getClasses") || [];
        renderClasses();
    } catch (err) {
        toast(err.message, "danger");
    }
}

function renderClasses() {
    const tbody = document.getElementById("classes-tbody");
    if (!tbody) return;
    tbody.innerHTML = classes.map(c => {
        const teachers = (c.teachers || [])
            .map(t => `${t.teacher?.profile?.name || ""} ${t.teacher?.profile?.lastname || ""}`.trim())
            .filter(Boolean).join(", ");
        const subjectName = c.subject?.name_subject || c.name_subject || "—";
        const sectionName = getClassSectionLabel(c);
        const schedulesText = getClassSchedulesText(c);
        return `
      <tr>
        <td>${subjectName}</td>
        <td>${sectionName}</td>
        <td>${schedulesText}</td>
        <td>${teachers || "—"}</td>
        <td>
          <button class="btn btn-sm btn-outline-primary me-1" onclick="openEditClass(${c.id_course})">
            <i class="bi bi-pencil"></i>
          </button>
          <button class="btn btn-sm btn-outline-danger" onclick="confirmDeleteClass(${c.id_course})">
            <i class="bi bi-trash"></i>
          </button>
        </td>
      </tr>`;
    }).join("");
}

async function openCreateClass() {
    if (!canManageAdminResources()) {
        showPermissionDenied();
        return;
    }
    const [sections, subjects, teacherList] = await Promise.all([
        getSections().catch(err => {
            toast(err.message, "danger");
            return [];
        }),
        getSubjects().catch(err => {
            toast(err.message, "danger");
            return [];
        }),
        api("GET", "/admin/getTeacher").catch(err => {
            toast(err.message, "danger");
            return [];
        })
    ]);

    const sectionOpts = (sections || []).map(sec =>
        `<option value="${sec.id_section}">${escapeHtml(sec.name)}</option>`
    ).join("");
    const subjectOpts = (subjects || []).map(subject =>
        `<option value="${subject.id_subject}">${escapeHtml(subject.name_subject)}</option>`
    ).join("");
    const teacherOpts = (teacherList || []).map(teacher =>
        `<option value="${teacher.id}">${escapeHtml(getTeacherDisplayName(teacher))}</option>`
    ).join("");

    showModal("Nueva Clase", `
    <select id="f-subject-id" class="form-select mb-2">
      <option value="">Seleccionar materia</option>
      ${subjectOpts}
    </select>
    <input id="f-new-subject" class="form-control mb-2" placeholder="Nueva materia (si no esta agregada)">
    <input id="f-subject-name" class="form-control mb-3" placeholder="Nombre temporal de la materia">
    <select id="f-section-id" class="form-select mb-3">
      <option value="">Seleccionar sección</option>
      ${sectionOpts}
    </select>
    <select id="f-teacher-id" class="form-select mb-3">
      <option value="">Seleccionar maestro</option>
      ${teacherOpts}
    </select>
    <div class="border rounded-3 p-3">
      <div class="d-flex justify-content-between align-items-center mb-2">
        <h6 class="fw-bold mb-0">Horarios</h6>
        <button type="button" class="btn btn-outline-primary btn-sm" id="add-schedule-btn">
          <i class="bi bi-plus-lg me-1"></i> Agregar horario
        </button>
      </div>
      <div id="schedule-list">${buildScheduleRows()}</div>
    </div>
  `, async () => {
        let selectedSubjectId = document.getElementById("f-subject-id").value || null;
        const newSubjectName = document.getElementById("f-new-subject").value.trim();
        const typedName = document.getElementById("f-subject-name").value.trim();

        if (!selectedSubjectId && newSubjectName) {
            const created = await api("POST", "/admin/subjects", { name_subject: newSubjectName });
            _subjects = null;
            selectedSubjectId = created?.subject?.id_subject || null;
        }

        const body = {
            id_subject: selectedSubjectId,
            id_section: document.getElementById("f-section-id").value || null,
            teacher_id: document.getElementById("f-teacher-id").value || null,
            name_subject: typedName || newSubjectName,
            schedules: collectSchedulesFromModal()
        };
        try {
            await api("POST", "/admin/createClass", body);
            toast("Clase creada");
            loadClasses();
            _catalogs = null;
        } catch (err) { toast(err.message, "danger"); }
    });

    document.getElementById("f-subject-id")?.addEventListener("change", e => {
        const selected = (subjects || []).find(s => String(s.id_subject) === String(e.target.value));
        if (selected) document.getElementById("f-subject-name").value = selected.name_subject || "";
    });

    wireScheduleEditor();
}

async function openEditClass(id) {
    if (!canManageAdminResources()) {
        showPermissionDenied();
        return;
    }
    const c = classes.find(x => x.id_course === id);
    if (!c) return;
    const [sections, subjects, teacherList] = await Promise.all([
        getSections().catch(err => {
            toast(err.message, "danger");
            return [];
        }),
        getSubjects().catch(err => {
            toast(err.message, "danger");
            return [];
        }),
        api("GET", "/admin/getTeacher").catch(err => {
            toast(err.message, "danger");
            return [];
        })
    ]);
    const sectionOpts = (sections || []).map(sec =>
        `<option value="${sec.id_section}" ${Number(c.id_section) === Number(sec.id_section) ? "selected" : ""}>${escapeHtml(sec.name)}</option>`
    ).join("");
    const subjectOpts = (subjects || []).map(subject =>
        `<option value="${subject.id_subject}" ${Number(c.id_subject) === Number(subject.id_subject) ? "selected" : ""}>${escapeHtml(subject.name_subject)}</option>`
    ).join("");
    const selectedTeacherId = Number(c.teachers?.[0]?.user_id || c.teachers?.[0]?.teacher?.id || 0);
    const teacherOpts = (teacherList || []).map(teacher =>
        `<option value="${teacher.id}" ${selectedTeacherId === Number(teacher.id) ? "selected" : ""}>${escapeHtml(getTeacherDisplayName(teacher))}</option>`
    ).join("");

    showModal("Editar Clase", `
    <select id="f-subject-id" class="form-select mb-2">
      <option value="">Seleccionar materia</option>
      ${subjectOpts}
    </select>
    <input id="f-new-subject" class="form-control mb-2" placeholder="Nueva materia (opcional)">
    <input id="f-subject-name" class="form-control mb-3" placeholder="Nombre" value="${escapeHtml(c.name_subject || "")}">
    <select id="f-section-id" class="form-select mb-3">
      <option value="">Seleccionar sección</option>
      ${sectionOpts}
    </select>
    <select id="f-teacher-id" class="form-select mb-3">
      <option value="">Seleccionar maestro</option>
      ${teacherOpts}
    </select>
    <div class="border rounded-3 p-3">
      <div class="d-flex justify-content-between align-items-center mb-2">
        <h6 class="fw-bold mb-0">Horarios</h6>
        <button type="button" class="btn btn-outline-primary btn-sm" id="add-schedule-btn">
          <i class="bi bi-plus-lg me-1"></i> Agregar horario
        </button>
      </div>
      <div id="schedule-list">${buildScheduleRows(c.schedules)}</div>
    </div>
  `, async () => {
        let selectedSubjectId = document.getElementById("f-subject-id").value || null;
        const newSubjectName = document.getElementById("f-new-subject").value.trim();
        const typedName = document.getElementById("f-subject-name").value.trim();
        const selectedSectionId = document.getElementById("f-section-id").value || null;
        const selectedTeacherId = document.getElementById("f-teacher-id").value || null;
        const nextSchedules = collectSchedulesFromModal();

        if (!selectedSubjectId && newSubjectName) {
            const created = await api("POST", "/admin/subjects", { name_subject: newSubjectName });
            _subjects = null;
            selectedSubjectId = created?.subject?.id_subject || null;
        }

        const body = {
            teacher_id: selectedTeacherId
        };

        if (String(selectedSubjectId || "") !== String(c.id_subject || "")) {
            body.id_subject = selectedSubjectId;
        }

        if (String(selectedSectionId || "") !== String(c.id_section || "")) {
            body.id_section = selectedSectionId;
        }

        if ((typedName || newSubjectName) && (typedName || newSubjectName) !== (c.name_subject || "")) {
            body.name_subject = typedName || newSubjectName;
        }

        if (schedulesChanged(c.schedules || [], nextSchedules)) {
            body.schedules = nextSchedules;
        }

        try {
            await api("PUT", `/admin/updateClass/${id}`, body);
            toast("Clase actualizada");
            loadClasses();
            _catalogs = null;
        } catch (err) { toast(err.message, "danger"); }
    });

    document.getElementById("f-subject-id")?.addEventListener("change", e => {
        const selected = (subjects || []).find(s => String(s.id_subject) === String(e.target.value));
        if (selected) document.getElementById("f-subject-name").value = selected.name_subject || "";
    });

    wireScheduleEditor();
}

function confirmDeleteClass(id) {
    if (!canManageAdminResources()) {
        showPermissionDenied();
        return;
    }
    const c = classes.find(x => x.id_course === id);
    showModal("Eliminar Clase",
        `<p>¿Eliminar <strong>${c?.name_subject || id}</strong>? Se eliminarán asistencias e inscripciones.</p>`,
        async () => {
            try {
                await api("DELETE", `/admin/deleteClass/${id}`);
                toast("Clase eliminada");
                loadClasses();
                _catalogs = null;
            } catch (err) { toast(err.message, "danger"); }
        }, "danger"
    );
}

let enrollmentStudents = [];
let enrollmentCourses = [];

function getEnrollmentCourseLabel(course) {
    const subject = course?.subject?.name_subject || course?.name_subject || "Curso";
    const section = course?.section?.name || "Sin sección";
    const firstSchedule = Array.isArray(course?.schedules) && course.schedules.length > 0
        ? course.schedules[0]
        : null;
    const scheduleText = firstSchedule
        ? ` — ${firstSchedule.day_of_week} ${String(firstSchedule.start_time || "").slice(0, 5)}-${String(firstSchedule.end_time || "").slice(0, 5)}`
        : "";

    return `${subject} — ${section}${scheduleText}`;
}

function updateEnrollmentCourseSummary(courseId) {
    const summary = document.getElementById("enroll-course-summary");
    if (!summary) return;

    if (!courseId) {
        summary.textContent = "Selecciona un curso.";
        return;
    }

    const course = enrollmentCourses.find(c => String(c.id_course) === String(courseId));
    if (!course) {
        summary.textContent = "Curso no encontrado.";
        return;
    }

    const subject = course?.subject?.name_subject || course?.name_subject || "Curso";
    const section = course?.section?.name || "Sin sección";
    const schedules = Array.isArray(course?.schedules) && course.schedules.length > 0
        ? course.schedules.map(s => `${s.day_of_week} ${String(s.start_time || "").slice(0, 5)}-${String(s.end_time || "").slice(0, 5)}`).join(" | ")
        : "Sin horario asignado";

    summary.textContent = `${subject} — ${section} — ${schedules}`;
}

async function loadEnrollmentSection() {
    if (!canManageAdminResources()) return;
    // Poblar selector de cursos (SIEMPRE refrescar)
    const courseSelect = document.getElementById("enroll-course-select");
    if (courseSelect) {
        courseSelect.innerHTML = '<option value="">Seleccionar curso…</option>';
        try {
            const data = await api("GET", "/admin/getClasses") || [];
            enrollmentCourses = data;
            data.forEach(c => {
                const opt = document.createElement("option");
                opt.value = c.id_course;
                opt.textContent = getEnrollmentCourseLabel(c);
                courseSelect.appendChild(opt);
            });
        } catch (err) { toast(err.message, "danger"); }
    }

    const studentSelect = document.getElementById("enroll-student-select");
    if (studentSelect) {
        studentSelect.innerHTML = '<option value="">Seleccionar alumno…</option>';
        try {
            const data = await api("GET", "/admin/getStudent") || [];
            enrollmentStudents = data;
            data.forEach(s => {
                const profile = s.profile || {};
                const nombre = `${profile.name || ""} ${profile.lastname || ""}`.trim() || s.email;
                const opt = document.createElement("option");
                opt.value = s.id;
                opt.textContent = `${nombre}${s.studentInfo?.student_code ? ` (${s.studentInfo.student_code})` : ""}`;
                studentSelect.appendChild(opt);
            });
        } catch (err) { toast(err.message, "danger"); }
    }

    const codeInput = document.getElementById("enroll-student-code");
    if (codeInput && !codeInput.dataset.wired) {
        codeInput.dataset.wired = "1";
        codeInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                findStudentByCode();
            }
        });
    }

    if (courseSelect && !courseSelect.dataset.wired) {
        courseSelect.dataset.wired = "1";
        courseSelect.addEventListener("change", () => {
            const id = courseSelect.value;
            const syncResult = document.getElementById("enroll-sync-result");
            if (syncResult) {
                syncResult.className = "small px-3 pt-3 text-muted";
                syncResult.textContent = "";
            }
            if (id) {
                updateEnrollmentCourseSummary(id);
                loadEnrolledStudents(id);
            }
            else {
                updateEnrollmentCourseSummary("");
                document.getElementById("enroll-tbody").innerHTML =
                    `<tr><td colspan="4" class="text-center text-muted py-3">Selecciona un curso.</td></tr>`;
                document.getElementById("enroll-count").textContent = "—";
            }
        });
    }

    updateEnrollmentCourseSummary(courseSelect?.value || "");
}

async function loadEnrolledStudents(courseId) {
    if (!canManageAdminResources()) return;
    const tbody = document.getElementById("enroll-tbody");
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted py-3">Cargando…</td></tr>`;

    try {
        const rows = await api("GET", `/admin/enrollments/course/${courseId}`) || [];
        document.getElementById("enroll-count").textContent = rows.length;

        if (!rows.length) {
            tbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted py-3">Sin alumnos inscritos.</td></tr>`;
            return;
        }

        tbody.innerHTML = rows.map(row => {
            const s = row.student || {};
            const profile = s.profile || {};
            const info = s.studentInfo || {};
            const nombre = `${profile.name || ""} ${profile.lastname || ""}`.trim() || s.email || "—";
            return `
        <tr>
          <td>${nombre}</td>
          <td class="text-muted small">${s.email || "—"}</td>
          <td>${info.student_code || "—"}</td>
          <td class="text-end">
            <button class="btn btn-sm btn-outline-danger"
              onclick="confirmDeleteEnrollment(${s.id}, ${courseId}, '${nombre.replace(/'/g, "\\'")}')">
              <i class="bi bi-person-dash"></i> Eliminar
            </button>
          </td>
        </tr>`;
        }).join("");
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="4" class="text-danger text-center py-3">${err.message}</td></tr>`;
    }
}

async function syncEnrollmentsWithSection() {
    if (!canManageAdminResources()) {
        showPermissionDenied();
        return;
    }
    const courseId = document.getElementById("enroll-course-select")?.value;
    const resultEl = document.getElementById("enroll-sync-result");

    if (!courseId) {
        toast("Selecciona un curso.", "warning");
        return;
    }

    const course = enrollmentCourses.find(c => String(c.id_course) === String(courseId));
    const courseLabel = course ? getEnrollmentCourseLabel(course) : `Curso ${courseId}`;

    if (resultEl) {
        resultEl.className = "small px-3 pt-3 text-muted";
        resultEl.textContent = `Sincronizando inscritos de ${courseLabel}…`;
    }

    try {
        const res = await api("POST", `/admin/enrollments/sync-section/${courseId}`);
        const removed = Array.isArray(res?.removed) ? res.removed : [];
        const protectedRows = Array.isArray(res?.protected) ? res.protected : [];
        const previewRemoved = removed.slice(0, 5).map(row => row.student_code || row.name || row.email || row.user_id).join(", ");
        const previewProtected = protectedRows.slice(0, 5).map(row => row.student_code || row.name || row.email || row.user_id).join(", ");

        if (resultEl) {
            resultEl.className = "small px-3 pt-3 text-muted";
            resultEl.innerHTML = `
        <div><strong>Sincronización completada.</strong></div>
        <div>Eliminados: ${res?.removed_count ?? 0}</div>
        <div>Conservados por asistencia: ${res?.protected_count ?? 0}</div>
        <div>Conservados: ${res?.kept_count ?? 0}</div>
        ${previewRemoved ? `<div class="text-danger mt-1">Eliminados: ${escapeHtml(previewRemoved)}${removed.length > 5 ? ` y ${removed.length - 5} más…` : ""}</div>` : ""}
        ${previewProtected ? `<div class="text-warning mt-1">Conservados por asistencia: ${escapeHtml(previewProtected)}${protectedRows.length > 5 ? ` y ${protectedRows.length - 5} más…` : ""}</div>` : ""}
      `;
        }

        toast(`Sincronización completada. Eliminados: ${res?.removed_count ?? 0}. Conservados por asistencia: ${res?.protected_count ?? 0}.`);
        await loadEnrolledStudents(courseId);
    } catch (err) {
        if (resultEl) {
            resultEl.className = "small px-3 pt-3 text-danger";
            resultEl.textContent = err.message;
        }
        toast(err.message, "danger");
    }
}

async function enrollSelectedStudent() {
    if (!canManageAdminResources()) {
        showPermissionDenied();
        return;
    }
    const courseId = document.getElementById("enroll-course-select")?.value;
    const studentId = document.getElementById("enroll-student-select")?.value;

    if (!courseId) { toast("Selecciona un curso.", "warning"); return; }
    if (!studentId) { toast("Selecciona un alumno.", "warning"); return; }

    try {
        const res = await api("POST", "/admin/enrollStudent", {
            user_id: Number(studentId),
            courses: [Number(courseId)]
        });
        if (res.omitidos?.length) {
            toast("El alumno ya estaba inscrito en ese curso.", "warning");
        } else {
            toast("Alumno inscrito correctamente.");
        }
        loadEnrolledStudents(courseId);
    } catch (err) { toast(err.message, "danger"); }
}

function findStudentByCode() {
    const codeInput = document.getElementById("enroll-student-code");
    const studentSelect = document.getElementById("enroll-student-select");
    const result = document.getElementById("enroll-student-result");
    const code = String(codeInput?.value || "").trim();

    if (!code) {
        if (result) result.innerHTML = '<span class="text-muted">Ingresa un código para buscar.</span>';
        return;
    }

    const student = enrollmentStudents.find(s =>
        String(s.studentInfo?.student_code || "").trim() === code
    );

    if (!student) {
        if (result) result.innerHTML = '<span class="text-danger">Alumno no encontrado.</span>';
        if (studentSelect) studentSelect.value = "";
        return;
    }

    if (studentSelect) studentSelect.value = String(student.id);

    const profile = student.profile || {};
    const nombre = `${profile.name || ""} ${profile.lastname || ""}`.trim() || student.email;
    if (result) {
        result.innerHTML = `<span class="text-success">${nombre} • ${student.email}</span>`;
    }
}

async function enrollSelectedSection() {
    if (!canManageAdminResources()) {
        showPermissionDenied();
        return;
    }
    const courseId = document.getElementById("enroll-course-select")?.value;
    const sectionId = document.getElementById("enroll-section-select")?.value;
    const result = document.getElementById("enroll-section-result");

    if (!courseId) { toast("Selecciona un curso.", "warning"); return; }
    if (!sectionId) { toast("Selecciona una sección.", "warning"); return; }

    if (result) result.innerHTML = '<span class="text-muted">Procesando inscripción por sección…</span>';

    try {
        const res = await api("POST", "/admin/enrollSection", {
            id_section: Number(sectionId),
            id_course: Number(courseId)
        });

        if (result) {
            result.innerHTML = `
        <div class="text-success fw-bold">Creados: ${res.created_count ?? 0}</div>
        <div class="text-warning fw-bold">Omitidos: ${res.skipped_count ?? 0}</div>
        <div class="text-muted">Total alumnos de la sección: ${res.total_students ?? 0}</div>
      `;
        }

        toast("Inscripción por sección completada");
        await loadEnrolledStudents(courseId);
    } catch (err) {
        if (result) result.innerHTML = `<span class="text-danger">${err.message}</span>`;
        toast(err.message, "danger");
    }
}

function confirmDeleteEnrollment(userId, courseId, nombre) {
    if (!canManageAdminResources()) {
        showPermissionDenied();
        return;
    }
    showModal(
        "Eliminar inscripción",
        `<p>¿Eliminar a <strong>${nombre}</strong> de este curso?</p>`,
        async () => {
            try {
                await api("DELETE", "/admin/deleteEnrollment", { user_id: userId, id_course: Number(courseId) });
                toast("Inscripción eliminada.");
                loadEnrolledStudents(courseId);
            } catch (err) { toast(err.message, "danger"); }
        },
        "danger"
    );
}

function showModal(title, bodyHtml, onConfirm, confirmStyle = "primary") {
    document.getElementById("generic-modal")?.remove();

    const modal = document.createElement("div");
    modal.id = "generic-modal";
    modal.innerHTML = `
    <div class="modal fade" id="_gm" tabindex="-1">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">${title}</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">${bodyHtml}</div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
            <button type="button" class="btn btn-${confirmStyle}" id="_gm-confirm">Confirmar</button>
          </div>
        </div>
      </div>
    </div>`;
    document.body.appendChild(modal);

    const instance = new bootstrap.Modal(document.getElementById("_gm"));
    document.getElementById("_gm-confirm").addEventListener("click", async () => {
        try {
            await onConfirm();
            instance.hide();
        } catch (_) { }
    });
    document.getElementById("_gm").addEventListener("hidden.bs.modal", () => modal.remove());
    instance.show();
}

const SECTIONS = ["dashboard", "teachers", "students", "classes", "enrollments", "statistics"];
const LIMITED_ADMIN_SECTIONS = ["dashboard", "students", "statistics"];
const SECTION_TITLES = {
    dashboard: "Dashboard General",
    teachers: "Maestros",
    students: "Alumnos",
    classes: "Clases",
    enrollments: "Inscripciones",
    statistics: "Estadísticas"
};

function showSection(name) {
    const allowedSections = canManageAdminResources() ? SECTIONS : LIMITED_ADMIN_SECTIONS;
    const targetSection = document.getElementById(`section-${name}`) && allowedSections.includes(name) ? name : "dashboard";

    SECTIONS.forEach(s => {
        const el = document.getElementById(`section-${s}`);
        if (el) el.classList.toggle("d-none", s !== targetSection);
    });

    document.querySelectorAll(".nav-link[data-section]").forEach(link => {
        link.classList.toggle("active", link.dataset.section === targetSection);
    });

    const titleEl = document.getElementById("admin-section-title");
    if (titleEl) titleEl.textContent = SECTION_TITLES[targetSection] || "Dashboard General";

    if (targetSection === "dashboard") loadDashboard();
    if (targetSection === "students") loadStudents();
    if (targetSection === "teachers" && canManageAdminResources()) loadTeachers();
    if (targetSection === "classes" && canManageAdminResources()) loadClasses();
    if (targetSection === "enrollments" && canManageAdminResources()) loadEnrollmentSection();
    if (targetSection === "statistics") loadAttendanceRiskStatistics();
}

function getRiskBadgeClass(level) {
    if (level === "Alto") return "bg-danger-subtle text-danger";
    if (level === "Medio") return "bg-warning-subtle text-warning";
    return "bg-success-subtle text-success";
}

function getTrendLabel(trend) {
    if (trend === "down") return "Baja";
    if (trend === "up") return "Mejora";
    return "Estable";
}

function getAttendanceCreditCount(item = {}) {
    return item.attendance_count ?? (
        Number(item.present_count || 0) +
        Number(item.late_count || 0) +
        Number(item.justified_count || 0)
    );
}

function populateRiskFilters(sections = [], courses = []) {
    const sectionSelect = document.getElementById("risk-section-filter");
    const courseSelect = document.getElementById("risk-course-filter");
    const monthInput = document.getElementById("risk-month-filter");

    if (sectionSelect && !sectionSelect.dataset.loaded) {
        sectionSelect.innerHTML = '<option value="">Todas las secciones</option>' + (sections || []).map(sec =>
            `<option value="${sec.id_section}">${sec.name}</option>`
        ).join("");
        sectionSelect.dataset.loaded = "1";
    }

    if (courseSelect && !courseSelect.dataset.loaded) {
        courseSelect.innerHTML = '<option value="">Todos los cursos</option>' + (courses || []).map(course =>
            `<option value="${course.id_course}">${escapeHtml(getEnrollmentCourseLabel(course))}</option>`
        ).join("");
        courseSelect.dataset.loaded = "1";
    }

    if (monthInput && !monthInput.value) {
        monthInput.value = getCurrentMonthValue();
    }
}

function renderRiskSummary(summary = {}, filters = {}) {
    const highEl = document.getElementById("risk-high-count");
    const mediumEl = document.getElementById("risk-medium-count");
    const lowEl = document.getElementById("risk-low-count");
    const avgEl = document.getElementById("risk-average-attendance");
    const summaryEl = document.getElementById("risk-summary-text");

    if (highEl) highEl.textContent = summary.high_count ?? 0;
    if (mediumEl) mediumEl.textContent = summary.medium_count ?? 0;
    if (lowEl) lowEl.textContent = summary.low_count ?? 0;
    if (avgEl) avgEl.textContent = `${summary.average_attendance ?? 0}%`;
    if (summaryEl) {
        summaryEl.textContent = `Periodo analizado: ${filters.month || getCurrentMonthValue()}.`;
    }
}

function renderRiskCharts(summary = {}, bySection = []) {
    const levelCtx = document.getElementById("risk-level-chart");
    const sectionCtx = document.getElementById("risk-section-chart");

    if (riskLevelChart) riskLevelChart.destroy();
    if (riskSectionChart) riskSectionChart.destroy();

    if (levelCtx) {
        riskLevelChart = new Chart(levelCtx, {
            type: "bar",
            data: {
                labels: ["Alto", "Medio", "Bajo"],
                datasets: [{
                    data: [summary.high_count ?? 0, summary.medium_count ?? 0, summary.low_count ?? 0],
                    backgroundColor: ["#dc3545", "#f59f00", "#198754"]
                }]
            },
            options: {
                responsive: true,
                plugins: { legend: { display: false } },
                scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
            }
        });
    }

    if (sectionCtx) {
        riskSectionChart = new Chart(sectionCtx, {
            type: "bar",
            data: {
                labels: bySection.map(row => row.section_name),
                datasets: [{
                    label: "Asistencia promedio",
                    data: bySection.map(row => row.average_attendance),
                    backgroundColor: "#9543ff"
                }]
            },
            options: {
                responsive: true,
                plugins: { legend: { display: false } },
                scales: { y: { beginAtZero: true, max: 100 } }
            }
        });
    }
}

function renderRiskTable(items = []) {
    const tbody = document.getElementById("risk-tbody");
    if (!tbody) return;

    if (!items.length) {
        const searchValue = getStatisticsSearchValue();
        const emptyMessage = searchValue
            ? "No se encontraron alumnos con esa búsqueda."
            : "Sin datos para los filtros seleccionados.";
        tbody.innerHTML = `<tr><td colspan="8" class="text-center text-muted py-3">${emptyMessage}</td></tr>`;
        return;
    }

    tbody.innerHTML = items.map(item => `
    <tr>
      <td>
        <button type="button" class="btn btn-link p-0 fw-semibold text-decoration-none" onclick="openStudentHistory(${Number(item.user_id)})">
          ${escapeHtml(item.student_name || "—")}
        </button>
        <div class="small text-muted">${escapeHtml(item.student_code || "—")}</div>
      </td>
      <td>${escapeHtml(item.section_name || "—")}</td>
      <td>${item.attendance_percentage ?? 0}% <span class="small text-muted">(${getAttendanceCreditCount(item)}/${item.total_records})</span></td>
      <td>${item.late_percentage ?? 0}% <span class="small text-muted">(${item.late_count})</span></td>
      <td>${item.absent_count ?? 0}</td>
      <td>${item.justified_count ?? 0}</td>
      <td>${getTrendLabel(item.trend)}</td>
      <td><span class="badge ${getRiskBadgeClass(item.risk_level)}">${item.risk_level} (${item.risk_score})</span></td>
    </tr>
  `).join("");
}

function getFilteredRiskItems() {
    const searchValue = getStatisticsSearchValue();
    if (!searchValue) return riskStatisticsItems;

    return riskStatisticsItems.filter((item) => {
        const haystacks = [
            item?.student_name,
            item?.email,
            item?.student_code
        ]
            .map((value) => String(value || "").toLowerCase())
            .filter(Boolean);

        return haystacks.some((value) => value.includes(searchValue));
    });
}

function applyRiskSearchFilter() {
    renderRiskTable(getFilteredRiskItems());
}

async function loadAttendanceRiskStatistics() {
    const tbody = document.getElementById("risk-tbody");
    if (tbody) {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center text-muted py-3">Analizando…</td></tr>`;
    }

    try {
        const [sections, courses] = canManageAdminResources()
            ? await Promise.all([
                getSections().catch(() => []),
                api("GET", "/admin/getClasses").catch(() => [])
            ])
            : [[], []];

        populateRiskFilters(sections, courses);

        const sectionId = document.getElementById("risk-section-filter")?.value || "";
        const courseId = document.getElementById("risk-course-filter")?.value || "";
        const month = document.getElementById("risk-month-filter")?.value || getCurrentMonthValue();

        const params = new URLSearchParams();
        if (sectionId) params.set("id_section", sectionId);
        if (courseId) params.set("id_course", courseId);
        if (month) params.set("month", month);

        const data = await api("GET", `/admin/statistics/attendance-risk?${params.toString()}`);
        riskStatisticsItems = Array.isArray(data.items) ? data.items : [];
        renderRiskSummary(data.summary || {}, data.filters || {});
        renderRiskCharts(data.summary || {}, data.by_section || []);
        applyRiskSearchFilter();
    } catch (err) {
        riskStatisticsItems = [];
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="8" class="text-center text-danger py-3">${err.message}</td></tr>`;
        }
        toast(err.message, "danger");
    }
}

document.addEventListener("DOMContentLoaded", () => {
    if (!getToken()) { logout(); return; }
    if (getStoredUser()?.must_change_password) { redirectToPasswordChange(); return; }

    renderAdminSidebarProfile();

    function applyAdminPermissions() {
        const isSuper = canManageAdminResources();
        const studentsCreateBtn = document.getElementById("students-create-btn");
        const studentsExcelCard = document.getElementById("students-excel-card");
        const teachersCreateBtn = document.getElementById("teachers-create-btn");
        const classesCreateBtn = document.getElementById("classes-create-btn");

        studentsCreateBtn?.classList.toggle("d-none", !isSuper);
        studentsExcelCard?.classList.toggle("d-none", !isSuper);
        teachersCreateBtn?.classList.toggle("d-none", !isSuper);
        classesCreateBtn?.classList.toggle("d-none", !isSuper);
    }

    applyAdminPermissions();

    const navLinks = document.querySelectorAll(".nav-link");
    const sectionNames = ["dashboard", "teachers", "students", "classes", "enrollments", "statistics"];
    navLinks.forEach((link, i) => {
        if (sectionNames[i]) {
            link.dataset.section = sectionNames[i];
            link.href = `#${sectionNames[i]}`;
            link.classList.toggle("d-none", !canManageAdminResources() && !LIMITED_ADMIN_SECTIONS.includes(link.dataset.section));
            link.addEventListener("click", (e) => {
                e.preventDefault();
                window.history.replaceState(null, "", `#${link.dataset.section}`);
                showSection(link.dataset.section);
            });
        }
    });

    document.getElementById("excel-upload-btn")?.addEventListener("click", handleExcelUpload);
    document.getElementById("risk-refresh-btn")?.addEventListener("click", loadAttendanceRiskStatistics);
    document.getElementById("admin-header-logout-btn")?.addEventListener("click", logout);
    document.getElementById("admin-sidebar-logout-btn")?.addEventListener("click", logout);
    document.getElementById("students-search")?.addEventListener("input", renderStudents);
    document.getElementById("statistics-student-search")?.addEventListener("input", () => {
        if (document.getElementById("section-statistics")?.classList.contains("d-none")) return;
        applyRiskSearchFilter();
    });

    const allowedSections = canManageAdminResources() ? SECTIONS : LIMITED_ADMIN_SECTIONS;
    const initialSection = String(window.location.hash || "").replace("#", "");
    showSection(allowedSections.includes(initialSection) ? initialSection : "dashboard");
});
