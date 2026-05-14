(() => {
    const API_BASE = "http://localhost:3000";

    const form = document.getElementById("login-form");
    const emailInput = document.getElementById("email");
    const passwordInput = document.getElementById("password");
    const togglePasswordBtn = document.getElementById("togglePasswordBtn");
    const toggleIcon = document.getElementById("toggleIcon");

    function showAlert(message, type = "danger") {
        let box = document.getElementById("loginMessage");

        if (!box) {
            box = document.createElement("div");
            box.id = "loginMessage";
            box.className = `alert alert-${type} mt-3`;
            form.appendChild(box);
        } else {
            box.className = `alert alert-${type} mt-3`;
        }

        box.textContent = message;
    }

    function normalizeSessionUser(user) {
        return {
            id: user?.id ?? null,
            email: user?.email || "",
            rol: Number(user?.rol ?? user?.role ?? 0),
            rol_name: user?.rol_name || "",
            name: user?.name || "",
            lastname: user?.lastname || "",
            must_change_password: Boolean(user?.must_change_password),
            is_super_admin: Boolean(user?.is_super_admin)
        };
    }

    function saveSession(token, user) {
        localStorage.setItem("token", token);
        localStorage.setItem("user", JSON.stringify(normalizeSessionUser(user)));
    }

    function redirectByRole(user) {
        if (user?.must_change_password) {
            window.location.href = "/assets/views/changePassword.html";
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

        if (rol === 3) {
            window.location.href = "/assets/views/student.html";
            return;
        }

        showAlert("Rol no reconocido.", "warning");
    }

    togglePasswordBtn?.addEventListener("click", () => {
        if (!passwordInput) return;
        const isHidden = passwordInput.type === "password";
        passwordInput.type = isHidden ? "text" : "password";
        if (toggleIcon) {
            toggleIcon.className = isHidden ? "bi bi-eye-fill" : "bi bi-eye-slash-fill";
        }
    });

    form?.addEventListener("submit", async (e) => {
        e.preventDefault();

        const email = emailInput?.value.trim().toLowerCase();
        const password = passwordInput?.value || "";

        if (!email || !password) {
            return showAlert("Completa correo y contraseña.", "warning");
        }

        const btn = form.querySelector('button[type="submit"]');
        const prev = btn?.innerHTML;

        if (btn) {
            btn.disabled = true;
            btn.innerHTML = "Ingresando...";
        }

        try {
            const res = await fetch(`${API_BASE}/login`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ email, password })
            });

            const data = await res.json().catch(() => ({}));

            if (!res.ok) {
                return showAlert(data?.error || "No se pudo iniciar sesión.");
            }

            if (!data?.token || !data?.user) {
                return showAlert("La respuesta del servidor es inválida.");
            }

            saveSession(data.token, data.user);
            showAlert(data?.mensaje || "Inicio de sesión exitoso.", "success");

            setTimeout(() => {
                console.log("LOGIN RESPONSE:", data);
                console.log("TOKEN:", data.token);
                //redirectByRole(normalizeSessionUser(data.user));
            }, 400);

        } catch (error) {
            console.error("login error:", error);
            showAlert("Error de red. Intenta más tarde.");
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = prev || "Iniciar sesión";
            }
        }
    });
})();
