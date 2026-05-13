(() => {
    const API_BASE = window.location.origin;
    const form = document.getElementById('forgot-form');

    function showAlert(msg, type = 'danger') {
        let box = document.getElementById('forgotMessage');
        if (!box) {
            box = document.createElement('div');
            box.id = 'forgotMessage';
            box.className = `alert alert-${type} mt-3`;
            form.appendChild(box);
        } else {
            box.className = `alert alert-${type} mt-3`;
        }
        box.textContent = msg;
    }
    form?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('email')?.value.trim().toLowerCase();
        if (!email) return showAlert('Ingresa tu correo.', 'warning');

        const btn = form.querySelector('button[type="submit"]');
        const prev = btn?.textContent;
        if (btn) { btn.disabled = true; btn.textContent = 'Enviando...'; }

        try {
            const res = await fetch(`${API_BASE}/auth/forgot`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email })
            });
            const data = await res.json().catch(() => ({}));

            if (!res.ok) {
                return showAlert(data?.error || 'No se pudo enviar el enlace.', 'danger');
            }

            if (data?.dev_mode && data?.reset_url) {
                showAlert(`Modo desarrollo: usa este enlace para probar: ${data.reset_url}`, 'warning');
            } else {
                showAlert(data?.message || 'Listo. Revisa tu correo para el enlace de restablecimiento.', 'success');
            }
            form.reset();
        } catch (err) {
            console.error(err);
            showAlert('Error de red. Intenta más tarde.', 'danger');
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = prev || 'Enviar enlace'; }
        }
    });
})();
