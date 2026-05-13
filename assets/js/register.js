(() => {
    const REGISTER_ENDPOINT = `${window.location.origin}/register`;

    function onReady(callback) {
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", callback, { once: true });
            return;
        }
        callback();
    }

    onReady(() => {
        const form = document.getElementById("register-form");
        const nameInput = document.getElementById("name");
        const lastnameInput = document.getElementById("lastname");
        const emailInput = document.getElementById("email");
        const passwordInput = document.getElementById("password");
        const confirmPasswordInput = document.getElementById("confirmPassword");
        const alertBox = document.getElementById("form-alert");
        const submitButton = form?.querySelector('button[type="submit"]');
        const togglePasswordIcon = document.getElementById("togglePassword");
        const toggleConfirmIcon = document.getElementById("toggleConfirm");

        function showAlert(message, type = "danger") {
            if (!alertBox) return;
            alertBox.className = `alert alert-${type}`;
            alertBox.textContent = message;
            alertBox.classList.remove("d-none");
        }

        function clearAlert() {
            if (!alertBox) return;
            alertBox.textContent = "";
            alertBox.className = "alert d-none";
        }

        function isValidEmail(email) {
            return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
        }

        function isStudentEmail(email) {
            return String(email || "").toLowerCase().endsWith("@alumnos.udg.mx");
        }

        function togglePasswordVisibility(input, icon) {
            if (!input || !icon) return;
            const isHidden = input.type === "password";
            input.type = isHidden ? "text" : "password";
            icon.className = isHidden ? "bi bi-eye-fill" : "bi bi-eye-slash-fill";
        }

        togglePasswordIcon?.closest(".toggle-password")?.addEventListener("click", () => {
            togglePasswordVisibility(passwordInput, togglePasswordIcon);
        });

        toggleConfirmIcon?.closest(".toggle-password")?.addEventListener("click", () => {
            togglePasswordVisibility(confirmPasswordInput, toggleConfirmIcon);
        });

        form?.addEventListener("submit", async (event) => {
            event.preventDefault();
            clearAlert();

            const name = nameInput?.value.trim() || "";
            const lastname = lastnameInput?.value.trim() || "";
            const email = emailInput?.value.trim().toLowerCase() || "";
            const password = passwordInput?.value || "";
            const confirmPassword = confirmPasswordInput?.value || "";

            if (!name || !lastname || !email || !password || !confirmPassword) {
                showAlert("Completa todos los campos obligatorios.", "warning");
                return;
            }

            if (!isValidEmail(email)) {
                showAlert("Ingresa un correo electrónico válido.", "warning");
                return;
            }

            if (!isStudentEmail(email)) {
                showAlert("El registro público solo permite correos @alumnos.udg.mx.", "warning");
                return;
            }

            if (password.length < 8) {
                showAlert("La contraseña debe tener al menos 8 caracteres.", "warning");
                return;
            }

            if (password !== confirmPassword) {
                showAlert("Las contraseñas no coinciden.", "warning");
                return;
            }

            const previousLabel = submitButton?.innerHTML;
            if (submitButton) {
                submitButton.disabled = true;
                submitButton.innerHTML = "Registrando...";
            }

            try {
                const response = await fetch(REGISTER_ENDPOINT, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({ name, lastname, email, password })
                });

                const data = await response.json().catch(() => ({}));

                if (!response.ok) {
                    showAlert(data?.error || "No se pudo completar el registro.");
                    return;
                }

                showAlert(data?.mensaje || "Registro exitoso. Redirigiendo al login...", "success");

                window.setTimeout(() => {
                    window.location.href = "/assets/views/login.html";
                }, 1000);
            } catch (error) {
                console.error("register error:", error);
                showAlert("Error de red. Intenta más tarde.");
            } finally {
                if (submitButton) {
                    submitButton.disabled = false;
                    submitButton.innerHTML = previousLabel || "Registrarse";
                }
            }
        });
    });
})();
