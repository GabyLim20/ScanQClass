(() => {
  const API_BASE = window.location.origin;
  const form = document.getElementById('reset-form');
  const pwd  = document.getElementById('newPassword');
  const pwd2 = document.getElementById('confirmPassword');

  const params = new URLSearchParams(location.search);
  const uid   = params.get('uid');
  const token = params.get('token');

  function showAlert(msg, type = 'danger') {
    let box = document.getElementById('resetMessage');
    if (!box) {
      box = document.createElement('div');
      box.id = 'resetMessage';
      box.className = `alert alert-${type} mt-3`;
      form.appendChild(box);
    } else {
      box.className = `alert alert-${type} mt-3`;
    }
    box.textContent = msg;
  }

  if (!uid || !token) {
    form?.querySelector('button[type="submit"]')?.setAttribute('disabled', 'disabled');
    showAlert('Enlace inválido o incompleto. Abre el link desde tu correo.', 'danger');
    return;
  }

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const p1 = pwd?.value || '';
    const p2 = pwd2?.value || '';
    if (p1.length < 8) return showAlert('La contraseña debe tener al menos 8 caracteres.', 'warning');
    if (p1 !== p2)   return showAlert('Las contraseñas no coinciden.', 'warning');

    const btn = form.querySelector('button[type="submit"]');
    const prev = btn?.textContent;
    if (btn) { btn.disabled = true; btn.textContent = 'Actualizando...'; }

    try {
      const res = await fetch(`${API_BASE}/auth/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid, token, newPassword: p1 })
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        return showAlert(data?.error || 'No se pudo restablecer la contraseña.', 'danger');
      }

      showAlert('Tu contraseña fue actualizada. Ya puedes iniciar sesión.', 'success');
      form.reset();
      setTimeout(() => { window.location.href = 'login.html'; }, 1500);
    } catch (err) {
      console.error(err);
      showAlert('Error de red. Intenta más tarde.', 'danger');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = prev || 'Guardar nueva contraseña'; }
    }
  });
})();
