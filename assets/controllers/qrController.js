const jwt  = require("jsonwebtoken");
const QRCode = require("qrcode");
const { User, DtInfo, InfoStudent } = require("../models");
const { requireEnv } = require("../utils/env");


const QR_SECRET     = `${requireEnv("JWT_SECRET")}_qr`;
const QR_EXPIRES_IN = "1m"; // QR válido 1 minuto

const verifyQrToken = (rawToken) => {
  try {
    const decoded = jwt.verify(rawToken, QR_SECRET);
    return { ok: true, ...decoded };
  } catch {
    return { ok: false };
  }
};

const generateStudentQr = async (req, res) => {
  try {
    const { id } = req.params;
    const requesterId = req.user?.id;
    const requesterRol = req.user?.rol;
    const targetUserId = requesterRol === 3 ? requesterId : id;

    // Solo para alumno 
    if (requesterRol === 3 && Number(requesterId) !== Number(id)) {
      return res.status(403).json({ error: "Solo puedes ver tu propio QR." });
    }

    const user = await User.findByPk(targetUserId, {
      attributes: ["id", "level"],
      include: [
        { model: DtInfo, as: "profile", attributes: ["name", "lastname"] },
        { model: InfoStudent, as: "studentInfo", attributes: ["id_student", "user_id"], required: false }
      ]
    });

    if (!user || user.level !== 3 || !user.studentInfo?.user_id) {
      return res.status(404).json({ error: "Alumno no encontrado." });
    }

    const payload = `SCANQ:${jwt.sign(
      { sid: user.id, typ: "student-qr" },
      QR_SECRET,
      { expiresIn: QR_EXPIRES_IN }
    )}`;

    const qr_data_url = await QRCode.toDataURL(payload, {
      errorCorrectionLevel: "M",
      margin: 2,
      width: 300
    });

    return res.json({
      qr_data_url,
      student_id: user.id,
      name: `${user.profile?.name || ""} ${user.profile?.lastname || ""}`.trim(),
      expires_in: 60
    });
  } catch (err) {
    console.error("generateStudentQr error:", err);
    return res.status(500).json({ error: "Error al generar el QR." });
  }
};

module.exports = { verifyQrToken, generateStudentQr };
