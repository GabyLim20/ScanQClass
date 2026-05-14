const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const { sequelize, User, DtInfo, Rol } = require("../models");
const { normalizeUserEmail, isReservedSuperAdminEmail } = require("../utils/superAdmin");


const JWT_SECRET = process.env.JWT_SECRET || "fallback_local_dev";

const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "1h";
const RESET_TOKEN_TTL_MIN = parseInt(process.env.RESET_TOKEN_TTL_MIN || "30", 10);

function roleFromEmail(email) {
  const e = normalizeUserEmail(email);
  if (e.endsWith("@sems.udg.mx"))        return 1; // Admin
  if (e.endsWith("@academicos.udg.mx"))  return 2; // Maestro
  if (e.endsWith("@alumnos.udg.mx"))     return 3; // Alumno
  return null;
}

function isStudentEmail(email) {
  return normalizeUserEmail(email).endsWith("@alumnos.udg.mx");
}

async function ensureReservedSuperAdmin(user) {
  if (!user) return user;

  const normalizedEmail = normalizeUserEmail(user.email);
  if (!isReservedSuperAdminEmail(normalizedEmail) || user.is_super_admin) {
    return user;
  }

  await user.update({ is_super_admin: true });
  user.is_super_admin = true;
  return user;
}

function resolveIsSuperAdmin(user) {
  const plainUser = typeof user?.get === "function" ? user.get({ plain: true }) : user;
  const rawValue = plainUser?.is_super_admin ?? user?.is_super_admin;

  return (
    rawValue === true ||
    rawValue === 1 ||
    String(rawValue) === "1" ||
    isReservedSuperAdminEmail(user?.email)
  );
}

function buildTransport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || process.env.MAIL_HOST,
    port: Number(process.env.SMTP_PORT || process.env.MAIL_PORT || 587),
    secure: Number(process.env.SMTP_PORT || process.env.MAIL_PORT || 587) === 465,
    auth: {
      user: process.env.SMTP_USER || process.env.MAIL_USER,
      pass: process.env.SMTP_PASS || process.env.MAIL_PASS
    },
  });
}

function isSmtpConfigured() {
  return Boolean(
    (process.env.SMTP_HOST || process.env.MAIL_HOST) &&
    (process.env.SMTP_PORT || process.env.MAIL_PORT) &&
    (process.env.SMTP_USER || process.env.MAIL_USER) &&
    (process.env.SMTP_PASS || process.env.MAIL_PASS) &&
    process.env.MAIL_FROM
  );
}

const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: "Correo y contraseña son obligatorios." });
    }

    const user = await User.findOne({
      where: { email: normalizeUserEmail(email) },
      include: [
        { model: DtInfo, as: "profile", attributes: ["name", "lastname"] },
        { model: Rol, as: "role", attributes: ["name_rol"] },
      ],
    });

    if (!user) return res.status(401).json({ error: "Usuario no encontrado." });
    await ensureReservedSuperAdmin(user);

    const isSuperAdmin = resolveIsSuperAdmin(user);

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).json({ error: "Contraseña incorrecta." });

    if (!JWT_SECRET) return res.status(500).json({ error: "JWT_SECRET no configurado." });

    const token = jwt.sign(
      {
        id: user.id,
        rol: user.level,
        role: user.level,
        name: user.profile?.name,
        lastname: user.profile?.lastname,
        is_super_admin: isSuperAdmin
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    return res.json({
      mensaje: "Inicio de sesión exitoso",
      token,
      user: {
        id: user.id,
        email: user.email,
        rol: user.level,
        rol_name: user.role?.name_rol || "",
        name: user.profile?.name || "",
        lastname: user.profile?.lastname || "",
        must_change_password: Boolean(user.must_change_password),
        is_super_admin: isSuperAdmin,
      },
    });
  } catch (err) {
    console.error("Error en login:", err);
    return res.status(500).json({ error: "Error interno del servidor." });
  }
};

const registerUser = async (req, res) => {
  const { email, password, name, lastname } = req.body || {};
  if (!email || !password || !name || !lastname) {
    return res.status(400).json({ error: "Faltan campos obligatorios." });
  }

  const cleanEmail = normalizeUserEmail(email);
  if (!isStudentEmail(cleanEmail)) {
    return res.status(403).json({
      error: "El registro público solo permite cuentas de alumno (@alumnos.udg.mx). Los usuarios admin y maestro deben crearse desde los flujos administrativos."
    });
  }

  try {
    const created = await sequelize.transaction(async (t) => {
      const exists = await User.findOne({ where: { email: cleanEmail }, transaction: t });
      if (exists) {
        const e = new Error("El correo ya está registrado.");
        e.status = 409;
        throw e;
      }

      const hash = await bcrypt.hash(password, 10);
      const user = await User.create(
        {
          email: cleanEmail,
          password: hash,
          level: 3,
          is_super_admin: false
        },
        { transaction: t }
      );

      await DtInfo.create({ name, lastname, user_id: user.id }, { transaction: t });

      return await User.findByPk(user.id, {
        attributes: ["id", "email", "level", "is_super_admin"],
        include: [
          { model: DtInfo, as: "profile", attributes: ["name", "lastname"] },
          { model: Rol, as: "role", attributes: ["name_rol"] },
        ],
        transaction: t,
      });
    });

    if (!JWT_SECRET) return res.status(500).json({ error: "JWT_SECRET no configurado." });

    const token = jwt.sign(
      {
        id: created.id,
        rol: created.level,
        role: created.level,
        name: created.profile?.name,
        lastname: created.profile?.lastname,
        is_super_admin: Boolean(created.is_super_admin)
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    return res.status(201).json({
      mensaje: "Registro exitoso",
      token,
      user: {
        id: created.id,
        email: created.email,
        rol: created.level,
        rol_name: created.role?.name_rol || "",
        name: created.profile?.name || "",
        lastname: created.profile?.lastname || "",
        must_change_password: false,
        is_super_admin: Boolean(created.is_super_admin),
      },
    });
  } catch (err) {
    console.error("Error en register:", err);
    return res.status(err.status || 500).json({ error: err.message || "Error interno del servidor." });
  }
};

const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ error: "Falta el correo." });

    const user = await User.findOne({ where: { email: normalizeUserEmail(email) } });
    if (!user) return res.status(404).json({ error: "El correo no está registrado." });

    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MIN * 60 * 1000);
    const clientBaseUrl = process.env.CLIENT_BASE_URL || `${req.protocol}://${req.get("host")}/assets/views`;
    const resetUrl = `${String(clientBaseUrl).replace(/\/$/, "")}/reset.html?uid=${user.id}&token=${rawToken}`;

    await user.update({ reset_token_hash: tokenHash, reset_token_expires: expiresAt });

    if (!isSmtpConfigured()) {
      console.warn("forgotPassword — SMTP no configurado. Usando modo desarrollo.");
      console.warn("forgotPassword resetUrl:", resetUrl);
      return res.status(200).json({
        message: "Enlace generado en modo desarrollo.",
        dev_mode: true,
        reset_url: resetUrl,
        uid: user.id,
        token: rawToken,
        expires_in_minutes: RESET_TOKEN_TTL_MIN
      });
    }

    const transporter = buildTransport();
    try {
      await transporter.sendMail({
        from: process.env.MAIL_FROM,
        to: user.email,
        subject: "Restablecer contraseña - ScanQClass",
        html: `
          <p>Hola,</p>
          <p>Recibimos una solicitud para restablecer tu contraseña.</p>
          <p>Haz clic en el siguiente enlace para continuar (vigencia: ${RESET_TOKEN_TTL_MIN} min):</p>
          <p><a href="${resetUrl}" target="_blank">${resetUrl}</a></p>
          <p>Si no fuiste tú, ignora este mensaje.</p>
        `,
      });
    } catch (mailErr) {
      console.error("forgotPassword — fallo SMTP:", mailErr);

      try {
        await user.update({ reset_token_hash: null, reset_token_expires: null });
      } catch (cleanupErr) {
        console.error("forgotPassword — fallo al limpiar token tras error SMTP:", cleanupErr);
      }

      return res.status(500).json({ error: "No se pudo enviar el enlace. Intenta de nuevo." });
    }

    return res.status(200).json({
      message: "Enlace enviado a tu correo.",
      dev_mode: false
    });
  } catch (err) {
    console.error("forgotPassword error:", err);
    return res.status(500).json({ error: "No se pudo enviar el enlace." });
  }
};

const resetPassword = async (req, res) => {
  try {
    const { uid, token, newPassword } = req.body || {};
    if (!uid || !token || !newPassword) {
      return res.status(400).json({ error: "Faltan parámetros (uid, token, newPassword)." });
    }

    // trim() solo para validar que no sea visualmente vacía.
    // El hash se hace sobre newPassword original, sin modificar.
    if (typeof newPassword !== "string" || newPassword.trim().length < 8) {
      return res.status(400).json({ error: "La contraseña debe tener al menos 8 caracteres." });
    }

    const user = await User.findByPk(uid);
    if (!user || !user.reset_token_hash || !user.reset_token_expires) {
      return res.status(400).json({ error: "Solicitud inválida." });
    }

    if (new Date(user.reset_token_expires).getTime() < Date.now()) {
      await user.update({ reset_token_hash: null, reset_token_expires: null });
      return res.status(400).json({ error: "El enlace ha expirado." });
    }

    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    if (tokenHash !== user.reset_token_hash) {
      return res.status(400).json({ error: "Token inválido." });
    }

    const hashed = await bcrypt.hash(newPassword, 10);

    await user.update({
      password:            hashed,
      must_change_password: false,
      reset_token_hash:    null,
      reset_token_expires: null,
    });

    return res.status(200).json({ message: "Contraseña actualizada correctamente." });
  } catch (err) {
    console.error("resetPassword error:", err);
    return res.status(500).json({ error: "No se pudo restablecer la contraseña." });
  }
};

const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body || {};

    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({ error: "Todos los campos son obligatorios." });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ error: "La nueva contraseña y la confirmación no coinciden." });
    }

    if (typeof newPassword !== "string" || newPassword.length < 8) {
      return res.status(400).json({ error: "La nueva contraseña debe tener al menos 8 caracteres." });
    }

    if (newPassword === currentPassword) {
      return res.status(400).json({ error: "La nueva contraseña debe ser distinta de la actual." });
    }

    const user = await User.findByPk(req.user.id);
    if (!user) {
      return res.status(404).json({ error: "Usuario no encontrado." });
    }

    const currentPasswordIsValid = await bcrypt.compare(currentPassword, user.password);
    if (!currentPasswordIsValid) {
      return res.status(400).json({ error: "La contraseña actual es incorrecta." });
    }

    const password = await bcrypt.hash(newPassword, 10);

    await user.update({
      password,
      must_change_password: false
    });

    return res.status(200).json({
      message: "Contraseña actualizada correctamente.",
      must_change_password: false
    });
  } catch (err) {
    console.error("changePassword error:", err);
    return res.status(500).json({ error: "No se pudo actualizar la contraseña." });
  }
};

module.exports = {
  loginUser,
  registerUser,
  forgotPassword,
  resetPassword,
  changePassword,
};
