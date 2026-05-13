(() => {
    const TOKEN_KEY = "token";
    const USER_KEY = "user";
    const form = document.getElementById("changePasswordForm");
    const currentPasswordInput = document.getElementById("currentPassword");
    const newPasswordInput = document.getElementById("newPassword");
    const confirmPasswordInput = document.getElementById("confirmPassword");
    const logoutBtn = document.getElementById("logoutBtn");
    const toggleButtons = document.querySelectorAll("[data-toggle-password]");
    const API_BASE = "http://localhost:3000";

    function getToken() {
        return localStorage.getItem(TOKEN_KEY);
    }

    function getUser() {
        try {
            return JSON.parse(localStorage.getItem(USER_KEY) || "null");
        } catch {
            return null;
        }
    }

    function saveUser(user) {
        localStorage.setItem(USER_KEY, JSON.stringify(user));
    }

    function logout() {
        localStorage.clear();
        window.location.href = "/assets/views/login.html";
    }

    function redirectByRole(user) {
        if (!user) {
            logout();
            return;
        }

        const rol = Number(user?.rol);

        if (rol === 1) {
            window.location.href = "/assets/views/admin.html";
            return;
        }

        if (rol === 2) {
            window.location.href = "/assets/views/teacher.html";
            return;
        }

        window.location.href = "/assets/views/student.html";
    }

    function showAlert(message, type = "danger") {
        let box = document.getElementById("changePasswordMessage");

        if (!box) {
            box = document.createElement("div");
            box.id = "changePasswordMessage";
            box.className = `alert alert-${type} mt-3`;
            form.appendChild(box);
        } else {
            box.className = `alert alert-${type} mt-3`;
        }

        box.textContent = message;
    }

    function normalizeErrorMessage(message) {
        const text = String(message || "").toLowerCase();

        if (text.includes("actual es incorrecta")) return "Contraseña actual incorrecta";
        if (text.includes("no coinciden")) return "Las contraseñas no coinciden";
        if (text.includes("al menos 8 caracteres")) return "Mínimo 8 caracteres";

        return message || "No se pudo actualizar la contraseña.";
    }

    const user = getUser();
    const token = getToken();

    if (!token) {
        logout();
        return;
    }

    if (!user?.must_change_password) {
        redirectByRole(user);
        return;
    }

    toggleButtons.forEach((button) => {
        button.addEventListener("click", () => {
            const targetId = button.dataset.togglePassword;
            const input = document.getElementById(targetId);
            const icon = button.querySelector("i");
            if (!input || !icon) return;

            const isPassword = input.type === "password";
            input.type = isPassword ? "text" : "password";
            icon.className = isPassword ? "bi bi-eye-fill" : "bi bi-eye-slash-fill";
        });
    });

    logoutBtn?.addEventListener("click", logout);

    form?.addEventListener("submit", async (event) => {
        event.preventDefault();

        const currentPassword = currentPasswordInput?.value || "";
        const newPassword = newPasswordInput?.value || "";
        const confirmPassword = confirmPasswordInput?.value || "";

        if (!currentPassword || !newPassword || !confirmPassword) {
            showAlert("Completa todos los campos.");
            return;
        }

        if (newPassword !== confirmPassword) {
            showAlert("Las contraseñas no coinciden");
            return;
        }

        if (newPassword.length < 8) {
            showAlert("Mínimo 8 caracteres");
            return;
        }

        const btn = form.querySelector('button[type="submit"]');
        const prev = btn?.innerHTML;

        if (btn) {
            btn.disabled = true;
            btn.innerHTML = "Actualizando...";
        }

        try {
            const response = await fetch(`${API_BASE}/auth/changePassword`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify({
                    currentPassword,
                    newPassword,
                    confirmPassword
                })
            });

            const data = await response.json().catch(() => ({}));

            if (response.status === 401) {
                logout();
                return;
            }

            if (!response.ok) {
                showAlert(normalizeErrorMessage(data?.error));
                return;
            }

            saveUser({ ...user, must_change_password: false });
            showAlert("Contraseña actualizada correctamente", "success");

            setTimeout(() => {
                redirectByRole({ ...user, must_change_password: false });
            }, 500);
        } catch (error) {
            console.error("changePassword error:", error);
            showAlert("Error de red. Intenta más tarde.");
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = prev || "Guardar contraseña";
            }
        }
    });
})();
