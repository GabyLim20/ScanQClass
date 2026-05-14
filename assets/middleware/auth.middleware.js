const jwt = require("jsonwebtoken");
const { User } = require("../models");
const { normalizeUserEmail, isReservedSuperAdminEmail } = require("../utils/superAdmin");

const JWT_SECRET = process.env.JWT_SECRET || "fallback_local_dev";
const PASSWORD_CHANGE_REQUIRED_CODE = "PASSWORD_CHANGE_REQUIRED";
console.log("[JWT MIDDLEWARE]", {
    length: JWT_SECRET.length,
    start: JWT_SECRET.slice(0, 3),
    end: JWT_SECRET.slice(-3)
});

// Rol 1 = Admin | Rol 2 = Maestro | Rol 3 = Alumno

function logAuthDebug(message, meta = {}) {
    console.info("[auth.middleware]", message, meta);
}

function passwordChangeRequired(res) {
    return res.status(403).json({
        error: "Debes cambiar tu contraseña antes de continuar.",
        code: PASSWORD_CHANGE_REQUIRED_CODE,
        must_change_password: true
    });
}

function superAdminRequired(res) {
    return res.status(403).json({
        error: "No tienes permiso para realizar esta acción"
    });
}

async function authenticateRequest(req, res) {
    const authorizationHeader = req.headers.authorization;
    const token = authorizationHeader?.split(" ")[1];

    logAuthDebug("authenticateRequest received header", {
        hasAuthorization: Boolean(authorizationHeader),
        hasBearerToken: Boolean(token),
        path: req.originalUrl,
        method: req.method
    });

    if (!token) return res.status(401).json({ error: "No token provided" });

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const decodedUserId = decoded?.id ?? decoded?.user_id ?? null;
        const decodedRole = Number(decoded?.rol ?? decoded?.role ?? 0);

        logAuthDebug("jwt.verify succeeded", {
            decodedId: decoded?.id ?? null,
            decodedUserId: decoded?.user_id ?? null,
            resolvedUserId: decodedUserId,
            decodedRol: decoded?.rol ?? null,
            decodedRole: decoded?.role ?? null,
            resolvedRole: decodedRole
        });

        const user = await User.findByPk(decodedUserId, {
            attributes: ["id", "email", "level", "must_change_password", "is_super_admin"]
        });

        logAuthDebug("user lookup completed", {
            resolvedUserId: decodedUserId,
            userFound: Boolean(user)
        });

        if (!user) {
            return res.status(401).json({ error: "Usuario no encontrado." });
        }

        if (isReservedSuperAdminEmail(normalizeUserEmail(user.email)) && !user.is_super_admin) {
            await user.update({ is_super_admin: true });
            user.is_super_admin = true;
        }

        req.user = {
            ...decoded,
            id: decodedUserId,
            user_id: decodedUserId,
            rol: Number(user.level),
            role: Number(user.level),
            must_change_password: Boolean(user.must_change_password),
            is_super_admin: Boolean(user.is_super_admin)
        };
        req.authUser = user;
        return true;
    } catch (error) {
        logAuthDebug("jwt.verify failed", {
            errorName: error?.name || "UnknownError",
            errorMessage: error?.message || "Unknown error"
        });
        return res.status(401).json({ error: "Token inválido" });
    }
}

function ensurePasswordAlreadyChanged(req, res) {
    if (req.user?.must_change_password) {
        return passwordChangeRequired(res);
    }
    return true;
}

const verifyToken = async (req, res, next) => {
    const authenticated = await authenticateRequest(req, res);
    if (authenticated !== true) return authenticated;
    if (![1, 2].includes(req.user.rol)) {
        return res.status(403).json({ error: "Acceso denegado. Solo maestros o admins." });
    }
    if (ensurePasswordAlreadyChanged(req, res) !== true) return;
    next();
};

const verifyAdmin = async (req, res, next) => {
    const authenticated = await authenticateRequest(req, res);
    if (authenticated !== true) return authenticated;
    if (req.user.rol !== 1) {
        return res.status(403).json({ error: "Acceso denegado. Solo admins." });
    }
    if (ensurePasswordAlreadyChanged(req, res) !== true) return;
    next();
};

const verifyTeacher = async (req, res, next) => {
    const authenticated = await authenticateRequest(req, res);
    if (authenticated !== true) return authenticated;
    if (req.user.rol !== 2) {
        return res.status(403).json({ error: "Acceso denegado. Solo maestros." });
    }
    if (ensurePasswordAlreadyChanged(req, res) !== true) return;
    next();
};

const verifyLogin = async (req, res, next) => {
    const authenticated = await authenticateRequest(req, res);
    if (authenticated !== true) return authenticated;
    if (ensurePasswordAlreadyChanged(req, res) !== true) return;
    next();
};

const verifyAuthenticated = async (req, res, next) => {
    const authenticated = await authenticateRequest(req, res);
    if (authenticated !== true) return authenticated;
    next();
};

const requireSuperAdmin = (req, res, next) => {
    if (req.user?.is_super_admin !== true) {
        return superAdminRequired(res);
    }
    next();
};

module.exports = {
    verifyToken,
    verifyAdmin,
    verifyTeacher,
    verifyLogin,
    verifyAuthenticated,
    requireSuperAdmin,
    PASSWORD_CHANGE_REQUIRED_CODE
};
