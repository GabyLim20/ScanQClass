const fs = require("fs");
const path = require("path");
const { Attendance, Course, Notification, InfoTeacher, DtInfo, InfoStudent } = require("../models");
const {
  analyzeJustificationEvidence,
  getFailedJustificationAnalysis,
  parseJustificationRequest,
  getJustificationReviewStatus,
  getJustificationOriginalText,
  getJustificationAiResult,
  getJustificationAiScore,
  getJustificationAiComment
} = require("../utils/justificationAI");

const JUSTIFICATION_UPLOADS_ROOT = path.resolve(__dirname, "..", "..", "uploads", "justifications");

function removeUploadedFile(filePath) {
  if (!filePath) return;
  fs.promises.unlink(filePath).catch(() => {});
}

function toPublicJustificationPath(filename) {
  return path.posix.join("uploads", "justifications", filename);
}

function resolveStoredJustificationPath(storedPath) {
  if (!storedPath) return null;
  const filename = path.basename(String(storedPath));
  const absolutePath = path.resolve(JUSTIFICATION_UPLOADS_ROOT, filename);
  if (!absolutePath.startsWith(JUSTIFICATION_UPLOADS_ROOT)) return null;
  return absolutePath;
}

function formatAttendanceDateKey(dateValue) {
  if (!dateValue) return null;
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

const getMyAttendance = async (req, res) => {
  try {
    const userId = req.user?.id;
    const userRole = req.user?.rol;

    if (!userId) {
      return res.status(401).json({ error: "No autenticado." });
    }

    if (userRole !== 3) {
      return res.status(403).json({ error: "Acceso denegado. Solo alumnos." });
    }

    const rows = await Attendance.findAll({
      where: { user_id: userId },
      attributes: [
        "id_attendance",
        "id_course",
        "date",
        "status",
        "justification_text",
        "justification_image",
        "justification_status",
        "justification_ai_result",
        "justification_ai_score",
        "justification_ai_comment",
        "justified_at"
      ],
      include: [
        {
          model: Course,
          as: "course",
          attributes: ["id_course", "name_subject"]
        }
      ],
      order: [["date", "DESC"]]
    });

    const payload = rows.map(row => {
      const plain = row.get({ plain: true });
      const reviewStatus = getJustificationReviewStatus(plain);
      const request = parseJustificationRequest(plain.justification_text);
      const displayStatus = plain.status === "absent" && reviewStatus === "pending"
        ? "pending"
        : plain.status === "absent" && reviewStatus === "accepted"
          ? "justified"
          : plain.status;

      return {
        ...plain,
        display_status: displayStatus,
        justification_text: getJustificationOriginalText(plain),
        justification_ai_result: getJustificationAiResult(plain),
        justification_ai_score: getJustificationAiScore(plain),
        justification_ai_comment: getJustificationAiComment(plain),
        justification_request: {
          ...(request && request.format === "scanq-justification-v1" ? request : {}),
          original_text: getJustificationOriginalText(plain),
          review_status: reviewStatus,
          ai_category: getJustificationAiResult(plain),
          ai_confidence: getJustificationAiScore(plain),
          ai_comment: getJustificationAiComment(plain)
        }
      };
    });

    return res.status(200).json(payload);
  } catch (err) {
    console.error("getMyAttendance error:", err);
    return res.status(500).json({ error: "Error interno al obtener el historial de asistencia." });
  }
};

const submitJustificationRequest = async (req, res) => {
  try {
    const userId = req.user?.id;
    const userRole = req.user?.rol;
    const { attendance_id, justification_text } = req.body;
    const uploadedFilePath = req.file?.path || null;

    if (!userId) {
      removeUploadedFile(uploadedFilePath);
      return res.status(401).json({ error: "No autenticado." });
    }

    if (userRole !== 3) {
      removeUploadedFile(uploadedFilePath);
      return res.status(403).json({ error: "Acceso denegado. Solo alumnos." });
    }

    if (!attendance_id) {
      removeUploadedFile(uploadedFilePath);
      return res.status(400).json({ error: "Falta attendance_id." });
    }

    if (!justification_text || String(justification_text).trim().length < 3) {
      removeUploadedFile(uploadedFilePath);
      return res.status(400).json({ error: "Debes ingresar un motivo de justificación (mínimo 3 caracteres)." });
    }

    const record = await Attendance.findOne({
      where: {
        id_attendance: Number(attendance_id),
        user_id: Number(userId)
      }
    });

    if (!record) {
      removeUploadedFile(uploadedFilePath);
      return res.status(404).json({ error: "No se encontró la asistencia para este alumno." });
    }

    if (String(record.justification_status || "").toUpperCase() === "APPROVED" || record.status === "justified") {
      removeUploadedFile(uploadedFilePath);
      return res.status(409).json({ error: "Esta asistencia ya fue justificada." });
    }

    if (record.status !== "absent") {
      removeUploadedFile(uploadedFilePath);
      return res.status(409).json({ error: `Solo se pueden solicitar justificaciones para inasistencias. Estado actual: "${record.status}".` });
    }

    const [profile, studentInfo] = await Promise.all([
      DtInfo.findOne({
        where: { user_id: Number(userId) },
        attributes: ["name", "lastname"]
      }),
      InfoStudent.findOne({
        where: { user_id: Number(userId) },
        attributes: ["student_code"]
      })
    ]);

    const studentName = `${profile?.name || ""} ${profile?.lastname || ""}`.trim() || `Alumno ${userId}`;
    const studentCode = studentInfo?.student_code || null;
    const absenceDate = formatAttendanceDateKey(record.date);
    const previousImagePath = resolveStoredJustificationPath(record.justification_image);
    const nextImagePath = req.file?.filename
      ? toPublicJustificationPath(req.file.filename)
      : (record.justification_image || null);
    let aiAnalysis;

    try {
      aiAnalysis = await analyzeJustificationEvidence({
        text: String(justification_text).trim(),
        imagePath: uploadedFilePath || previousImagePath,
        studentName,
        studentCode,
        absenceDate
      });
    } catch (analysisError) {
      console.error("submitJustificationRequest analysis error:", analysisError);
      aiAnalysis = getFailedJustificationAnalysis();
    }

    await record.update({
      justification_text: String(justification_text).trim(),
      justification_image: nextImagePath,
      justification_status: "PENDING",
      justification_ai_result: aiAnalysis.result,
      justification_ai_score: aiAnalysis.score,
      justification_ai_comment: aiAnalysis.comment
    });

    if (uploadedFilePath && previousImagePath && previousImagePath !== uploadedFilePath) {
      removeUploadedFile(previousImagePath);
    }

    return res.status(200).json({
      message: "Solicitud enviada correctamente. Tu solicitud será enviada al maestro para revisión.",
      justification_request: {
        original_text: String(justification_text).trim(),
        justification_image: nextImagePath,
        review_status: "pending",
        ai_category: aiAnalysis.result,
        ai_confidence: aiAnalysis.score,
        ai_comment: aiAnalysis.comment
      }
    });
  } catch (err) {
    removeUploadedFile(req.file?.path || null);
    console.error("submitJustificationRequest error:", err);
    return res.status(500).json({ error: "Error interno al enviar la solicitud de justificación." });
  }
};

const downloadJustificationImage = async (req, res) => {
  try {
    const userId = req.user?.id;
    const userRole = req.user?.rol;
    const attendanceId = Number(req.params.id);

    if (!userId) {
      return res.status(401).json({ error: "No autenticado." });
    }

    if (![1, 2].includes(Number(userRole))) {
      return res.status(403).json({ error: "Acceso denegado." });
    }

    if (!Number.isFinite(attendanceId) || attendanceId <= 0) {
      return res.status(400).json({ error: "El id de la asistencia no es válido." });
    }

    const record = await Attendance.findByPk(attendanceId);
    if (!record || !record.justification_image) {
      return res.status(404).json({ error: "Imagen de justificación no encontrada." });
    }

    if (Number(userRole) === 2) {
      const assignment = await InfoTeacher.findOne({
        where: {
          user_id: Number(userId),
          id_course: Number(record.id_course),
          id_teacher: Number(record.id_teacher)
        }
      });

      if (!assignment) {
        return res.status(403).json({ error: "No tienes permisos para ver esta imagen." });
      }
    }

    const absolutePath = resolveStoredJustificationPath(record.justification_image);
    if (!absolutePath || !fs.existsSync(absolutePath)) {
      return res.status(404).json({ error: "Archivo de justificación no encontrado." });
    }

    return res.sendFile(absolutePath);
  } catch (err) {
    console.error("downloadJustificationImage error:", err);
    return res.status(500).json({ error: "Error interno al obtener la imagen de justificación." });
  }
};

const getMyNotifications = async (req, res) => {
  try {
    const userId = req.user?.id;
    const userRole = req.user?.rol;

    if (!userId) {
      return res.status(401).json({ error: "No autenticado." });
    }

    if (userRole !== 3) {
      return res.status(403).json({ error: "Acceso denegado. Solo alumnos." });
    }

    const rows = await Notification.findAll({
      where: { user_id: Number(userId) },
      order: [["created_at", "DESC"]]
    });

    const unread_count = rows.filter(row => !row.is_read).length;
    return res.status(200).json({
      unread_count,
      items: rows
    });
  } catch (err) {
    console.error("getMyNotifications error:", err);
    return res.status(500).json({ error: "Error interno al obtener las notificaciones." });
  }
};

const markNotificationAsRead = async (req, res) => {
  try {
    const userId = req.user?.id;
    const userRole = req.user?.rol;
    const notificationId = Number(req.params.id);

    if (!userId) {
      return res.status(401).json({ error: "No autenticado." });
    }

    if (userRole !== 3) {
      return res.status(403).json({ error: "Acceso denegado. Solo alumnos." });
    }

    if (!Number.isFinite(notificationId) || notificationId <= 0) {
      return res.status(400).json({ error: "El id de la notificación no es válido." });
    }

    const row = await Notification.findOne({
      where: {
        id: notificationId,
        user_id: Number(userId)
      }
    });

    if (!row) {
      return res.status(404).json({ error: "Notificación no encontrada." });
    }

    if (!row.is_read) {
      await row.update({ is_read: true });
    }

    return res.status(200).json({ message: "Notificación marcada como leída." });
  } catch (err) {
    console.error("markNotificationAsRead error:", err);
    return res.status(500).json({ error: "Error interno al actualizar la notificación." });
  }
};

module.exports = {
  getMyAttendance,
  submitJustificationRequest,
  downloadJustificationImage,
  getMyNotifications,
  markNotificationAsRead
};
