const { Op } = require("sequelize");
const {
  sequelize,
  InfoTeacher,
  Enrollment,
  Course,
  Attendance,
  AttendanceSession,
  Pdf,
  DtInfo,
  User,
  InfoStudent,
  Section,
  CourseSchedule,
  Notification
} = require("../models");

const { verifyQrToken } = require("./qrController");
const {
  parseJustificationRequest,
  getJustificationReviewStatus,
  getJustificationOriginalText,
  getJustificationAiResult,
  getJustificationAiScore,
  getJustificationAiComment
} = require("../utils/justificationAI");
const { sendMailSafe, isMailConfigured } = require("../utils/mail");

const LATE_TOLERANCE_MINUTES = 20;
const DAY_NAMES = ["Domingo", "Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado"];
const MEXICO_TIME_ZONE = "America/Mexico_City";
const SCHEDULE_DEBUG_ENABLED = String(process.env.SCHEDULE_DEBUG || "").trim().toLowerCase() === "true";

function getMexicoDateTimeParts(dateValue = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: MEXICO_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).formatToParts(new Date(dateValue));

  return {
    year: Number(parts.find(p => p.type === "year")?.value || 0),
    month: Number(parts.find(p => p.type === "month")?.value || 0),
    day: Number(parts.find(p => p.type === "day")?.value || 0),
    hour: Number(parts.find(p => p.type === "hour")?.value || 0),
    minute: Number(parts.find(p => p.type === "minute")?.value || 0),
    second: Number(parts.find(p => p.type === "second")?.value || 0)
  };
}

function getCurrentMexicoDateTime(dateValue = new Date()) {
  const parts = getMexicoDateTimeParts(dateValue);
  return new Date(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second, 0);
}

function formatDateKeyMexico(dateValue) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: MEXICO_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date(dateValue));

  const year = parts.find(p => p.type === "year")?.value || "0000";
  const month = parts.find(p => p.type === "month")?.value || "00";
  const day = parts.find(p => p.type === "day")?.value || "00";

  return `${year}-${month}-${day}`;
}

function getCurrentMexicoDayName(dateValue = new Date()) {
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: MEXICO_TIME_ZONE,
    weekday: "long"
  }).format(new Date(dateValue))
    .replace(/^\w/, letter => letter.toUpperCase())
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function buildScheduleDate(baseDate, timeValue) {
  const [hours = 0, minutes = 0, seconds = 0] = String(timeValue || "00:00:00")
    .split(":")
    .map(Number);
  return new Date(
    baseDate.getFullYear(),
    baseDate.getMonth(),
    baseDate.getDate(),
    hours,
    minutes,
    seconds,
    0
  );
}

function getTimeValueInSeconds(timeValue) {
  const [hours = 0, minutes = 0, seconds = 0] = String(timeValue || "00:00:00")
    .split(":")
    .map(Number);
  return (hours * 3600) + (minutes * 60) + seconds;
}

function formatSecondsAsTime(totalSeconds = 0) {
  const safe = Math.max(0, Number(totalSeconds) || 0);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function getMexicoNowInSeconds(dateValue = new Date()) {
  const parts = getMexicoDateTimeParts(dateValue);
  return (parts.hour * 3600) + (parts.minute * 60) + parts.second;
}

function logScheduleCheck(context, payload) {
  if (!SCHEDULE_DEBUG_ENABLED) return;
  console.log(`[schedule-check] ${context}`, payload);
}

function findActiveSchedule(schedules, nowInSeconds, debugContext = null) {
  for (const s of schedules) {
    const startInSeconds = getTimeValueInSeconds(s.start_time);
    const endInSeconds = getTimeValueInSeconds(s.end_time);
    const isActive = nowInSeconds >= startInSeconds && nowInSeconds <= endInSeconds;

    if (debugContext) {
      logScheduleCheck(debugContext, {
        timezone: MEXICO_TIME_ZONE,
        serverNowIso: new Date().toISOString(),
        serverTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone || process.env.TZ || "unknown",
        mexicoNow: formatSecondsAsTime(nowInSeconds),
        start: String(s.start_time || ""),
        end: String(s.end_time || ""),
        isActive
      });
    }

    if (isActive) return s;
  }

  return null;
}

function resolveActiveSchedule(schedules, nowInSeconds, debugContext = null) {
  const activeSchedule = findActiveSchedule(schedules, nowInSeconds, debugContext);
  if (activeSchedule) return activeSchedule;

  let closest = schedules[0];
  let minDistance = Infinity;

  for (const s of schedules) {
    const startInSeconds = getTimeValueInSeconds(s.start_time);
    const endInSeconds = getTimeValueInSeconds(s.end_time);
    const distance = nowInSeconds < startInSeconds
      ? startInSeconds - nowInSeconds
      : nowInSeconds - endInSeconds;

    if (distance < minDistance) {
      minDistance = distance;
      closest = s;
    }
  }

  return closest;
}

function getRangeStart(dateValue) {
  return new Date(dateValue.getFullYear(), dateValue.getMonth(), dateValue.getDate(), 0, 0, 0, 0);
}

function getRangeEnd(dateValue) {
  return new Date(dateValue.getFullYear(), dateValue.getMonth(), dateValue.getDate(), 23, 59, 59, 999);
}

function isAttendanceCredit(status) {
  return status === "present" || status === "late" || status === "justified";
}

function getAttendanceStatus(row) {
  const request = parseJustificationRequest(row?.justification_text);
  if (row?.status === "absent" && request?.review_status === "accepted") {
    return "justified";
  }
  return row?.status;
}

function calculateAttendancePercentage(rows = []) {
  if (!rows.length) return 0;
  const attended = rows.filter(row => isAttendanceCredit(getAttendanceStatus(row))).length;
  return Math.round((attended / rows.length) * 100);
}

async function findOrCreateSession(t, { id_course, id_teacher, id_schedule, date }) {
  const where = {
    id_course: Number(id_course),
    id_teacher: Number(id_teacher),
    id_schedule: Number(id_schedule),
    date
  };

  const existing = await AttendanceSession.findOne({ where, transaction: t });
  if (existing) return { session: existing, created: false };

  const session = await AttendanceSession.create(
    {
      id_course: Number(id_course),
      id_teacher: Number(id_teacher),
      id_schedule: Number(id_schedule),
      date,
      status: "OPEN",
      opened_at: new Date()
    },
    { transaction: t }
  );

  return { session, created: true };
}

async function buildPendingJustificationsForTeacher(teacherUserId) {
  const assignments = await InfoTeacher.findAll({
    where: { user_id: teacherUserId },
    attributes: ["id_teacher", "id_course"],
    include: [
      {
        model: Course,
        as: "course",
        attributes: ["id_course", "name_subject"],
        include: [
          {
            model: Section,
            as: "section",
            attributes: ["id_section", "name"],
            required: false
          }
        ]
      }
    ]
  });

  const assignmentMap = new Map(
    assignments.map(row => [Number(row.id_teacher), row])
  );
  const assignmentIds = [...assignmentMap.keys()];
  if (!assignmentIds.length) return [];

  const rows = await Attendance.findAll({
    where: {
      id_teacher: { [Op.in]: assignmentIds },
      status: "absent",
      justification_text: { [Op.not]: null }
    },
    attributes: [
      "id_attendance",
      "user_id",
      "id_teacher",
      "id_course",
      "date",
      "justification_text",
      "justification_image",
      "justification_status",
      "justification_ai_result",
      "justification_ai_score",
      "justification_ai_comment"
    ],
    order: [["date", "DESC"]]
  });

  const filtered = rows.filter(row => getJustificationReviewStatus(row) === "pending");

  if (!filtered.length) return [];

  const studentIds = [...new Set(filtered.map(row => Number(row.user_id)).filter(Boolean))];
  const profiles = await DtInfo.findAll({
    where: { user_id: { [Op.in]: studentIds } },
    attributes: ["user_id", "name", "lastname"]
  });
  const studentInfos = await InfoStudent.findAll({
    where: { user_id: { [Op.in]: studentIds } },
    attributes: ["user_id", "student_code"]
  });

  const profileMap = new Map(
    profiles.map(row => [Number(row.user_id), `${row.name || ""} ${row.lastname || ""}`.trim()])
  );
  const studentInfoMap = new Map(
    studentInfos.map(row => [Number(row.user_id), row])
  );

  return filtered.map(row => {
    const request = parseJustificationRequest(row.justification_text);
    const assignment = assignmentMap.get(Number(row.id_teacher));
    return {
      id_attendance: row.id_attendance,
      user_id: row.user_id,
      id_course: row.id_course,
      date: formatDateKeyMexico(row.date),
      student_code: studentInfoMap.get(Number(row.user_id))?.student_code || null,
      student_name: profileMap.get(Number(row.user_id)) || `Alumno ${row.user_id}`,
      course_name: assignment?.course?.name_subject || `Curso ${row.id_course}`,
      section_name: assignment?.course?.section?.name || "—",
      original_text: getJustificationOriginalText(row) || "",
      justification_image: row.justification_image || null,
      justification_image_url: row.justification_image ? `/attendance/justifications/${row.id_attendance}/image` : null,
      ai_category: getJustificationAiResult(row) || request?.ai_category || "otro",
      ai_recommendation: request?.ai_recommendation || "revisar",
      ai_confidence: getJustificationAiScore(row) ?? request?.ai_confidence ?? null,
      ai_comment: getJustificationAiComment(row),
      ai_score: getJustificationAiScore(row) ?? request?.ai_confidence ?? null,
      review_status: getJustificationReviewStatus(row) || "pending"
    };
  });
}

const getTeacherDashboard = async (req, res) => {
  try {
    const teacherUserId = req.user?.id;
    if (!teacherUserId) {
      return res.status(401).json({ error: "No autenticado." });
    }

    const assignments = await InfoTeacher.findAll({
      where: { user_id: teacherUserId },
      attributes: ["id_teacher", "id_course"],
      include: [{
        model: Course,
        as: "course",
        attributes: ["id_course"],
        include: [{
          model: Enrollment,
          as: "enrollments",
          attributes: ["user_id"],
          required: false
        }]
      }]
    });

    const assignmentIds = assignments.map(row => Number(row.id_teacher)).filter(Boolean);
    const uniqueStudents = new Set();
    assignments.forEach(row => {
      (row.course?.enrollments || []).forEach(enrollment => {
        if (enrollment?.user_id) uniqueStudents.add(Number(enrollment.user_id));
      });
    });

    if (assignmentIds.length === 0) {
      return res.status(200).json({
        total_students: 0,
        attendance_today: 0,
        attendance_percentage: 0,
        last_week_percentage: 0,
        last_month_percentage: 0
      });
    }

    const now = new Date();
    const todayStart = getRangeStart(now);
    const todayEnd = getRangeEnd(now);

    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    const currentMonthEnd = getRangeEnd(now);

    const lastWeekEnd = new Date(todayStart.getTime() - 1);
    const lastWeekStart = new Date(lastWeekEnd.getFullYear(), lastWeekEnd.getMonth(), lastWeekEnd.getDate() - 6, 0, 0, 0, 0);

    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

    const [todayRows, currentMonthRows, lastWeekRows, lastMonthRows] = await Promise.all([
      Attendance.findAll({
        where: {
          id_teacher: { [Op.in]: assignmentIds },
          date: { [Op.between]: [todayStart, todayEnd] }
        },
        attributes: ["status", "justification_text"]
      }),
      Attendance.findAll({
        where: {
          id_teacher: { [Op.in]: assignmentIds },
          date: { [Op.between]: [currentMonthStart, currentMonthEnd] }
        },
        attributes: ["status", "justification_text"]
      }),
      Attendance.findAll({
        where: {
          id_teacher: { [Op.in]: assignmentIds },
          date: { [Op.between]: [lastWeekStart, lastWeekEnd] }
        },
        attributes: ["status", "justification_text"]
      }),
      Attendance.findAll({
        where: {
          id_teacher: { [Op.in]: assignmentIds },
          date: { [Op.between]: [lastMonthStart, lastMonthEnd] }
        },
        attributes: ["status", "justification_text"]
      })
    ]);

    return res.status(200).json({
      total_students: uniqueStudents.size,
      attendance_today: todayRows.filter(row => isAttendanceCredit(getAttendanceStatus(row))).length,
      attendance_percentage: calculateAttendancePercentage(currentMonthRows),
      last_week_percentage: calculateAttendancePercentage(lastWeekRows),
      last_month_percentage: calculateAttendancePercentage(lastMonthRows)
    });
  } catch (err) {
    console.error("getTeacherDashboard error:", err);
    return res.status(500).json({ error: "Error al obtener el dashboard del maestro." });
  }
};

/* ======================================================
   OBTENER CLASES 
   ====================================================== */
const getMyClasses = async (req, res) => {
  try {
    const teacherUserId = req.user?.id;

    if (!teacherUserId) {
      return res.status(401).json({ error: "No autenticado." });
    }

    const assignments = await InfoTeacher.findAll({
      where: { user_id: teacherUserId },
      attributes: ["id_teacher", "id_course"],
      include: [
        {
          model: Course,
          as: "course",
          attributes: ["id_course", "name_subject"],
          include: [
            {
              model: Section,
              as: "section",
              attributes: ["id_section", "name"],
              required: false
            },
            {
              model: CourseSchedule,
              as: "schedules",
              attributes: ["id_schedule", "day_of_week", "start_time", "end_time"],
              required: false
            },
            {
              model: Enrollment,
              as: "enrollments",
              attributes: ["user_id"],
              required: false
            }
          ]
        }
      ],
      order: [[{ model: Course, as: "course" }, { model: CourseSchedule, as: "schedules" }, "day_of_week", "ASC"]]
    });

    return res.status(200).json(assignments);
  } catch (err) {
    console.error("getMyClasses error:", err);
    return res.status(500).json({ error: "Error obteniendo las clases del maestro." });
  }
};

const getPendingJustifications = async (req, res) => {
  try {
    const teacherUserId = req.user?.id;
    if (!teacherUserId) {
      return res.status(401).json({ error: "No autenticado." });
    }

    const rows = await buildPendingJustificationsForTeacher(teacherUserId);
    return res.status(200).json({
      pending_count: rows.length,
      items: rows
    });
  } catch (err) {
    console.error("getPendingJustifications error:", err);
    return res.status(500).json({ error: "Error al obtener las solicitudes pendientes." });
  }
};

/* ======================================================
   TOMAR ASISTENCIA POR QR
   ====================================================== */
const takeAttendanceByQr = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const teacherId = req.user?.id;
    const { qr_token, qr, id_course } = req.body;
    const token = qr_token || qr;
    const normalizedCourseId = Number(id_course);

    if (!teacherId) {
      await t.rollback();
      return res.status(401).json({ error: "No autenticado." });
    }

    if (!token || !id_course) {
      await t.rollback();
      return res.status(400).json({ error: "Faltan datos obligatorios (QR o curso)." });
    }

    if (!Number.isFinite(normalizedCourseId) || normalizedCourseId <= 0) {
      await t.rollback();
      return res.status(400).json({ error: "El id_course no es válido." });
    }

    const rawJwt = token.startsWith("SCANQ:") ? token.slice(6) : token;
    const decoded = verifyQrToken(rawJwt);

    if (!decoded.ok || decoded.typ !== "student-qr" || !decoded.sid) {
      await t.rollback();
      return res.status(400).json({ error: "QR inválido o expirado." });
    }

    const studentId = Number(decoded.sid);
    if (!Number.isFinite(studentId) || studentId <= 0) {
      await t.rollback();
      return res.status(400).json({ error: "El QR no contiene un alumno válido." });
    }

    const student = await User.findByPk(studentId, {
      attributes: ["id", "level"],
      include: [
        {
          model: InfoStudent,
          as: "studentInfo",
          attributes: ["id_student", "user_id"],
          required: false
        }
      ],
      transaction: t
    });
    if (!student || student.level !== 3 || !student.studentInfo?.user_id) {
      await t.rollback();
      return res.status(404).json({ error: "Alumno no encontrado." });
    }


    const assignment = await InfoTeacher.findOne({
      where: { user_id: teacherId, id_course: normalizedCourseId },
      transaction: t
    });
    if (!assignment) {
      await t.rollback();
      return res.status(403).json({ error: "No estás asignado a este curso." });
    }



    const serverNow = new Date();
    const mexicoNow = getCurrentMexicoDateTime(serverNow);
    const nowInSeconds = getMexicoNowInSeconds(serverNow);
    const dayName = getCurrentMexicoDayName(serverNow);
    const todaySchedules = await CourseSchedule.findAll({
      where: {
        id_course: normalizedCourseId,
        day_of_week: dayName
      },
      attributes: ["id_schedule", "start_time", "end_time"],
      order: [["start_time", "ASC"]],
      transaction: t
    });

    // Sin horario no se puede abrir sesión
    if (todaySchedules.length === 0) {
      await t.rollback();
      return res.status(400).json({
        error: "No hay horario configurado para esta clase el día de hoy."
      });
    }

    const activeSchedule = findActiveSchedule(
      todaySchedules,
      nowInSeconds,
      `takeAttendanceByQr course=${normalizedCourseId}`
    );
    if (!activeSchedule) {
      await t.rollback();
      return res.status(400).json({ error: "No hay clase activa en este momento" });
    }

    const classStart = buildScheduleDate(mexicoNow, activeSchedule.start_time);
    const lateLimit = new Date(classStart.getTime() + LATE_TOLERANCE_MINUTES * 60 * 1000);
    const attendanceStatus = mexicoNow > lateLimit ? "late" : "present";

    const todayDateKey = formatDateKeyMexico(serverNow);

    const attendance = await Attendance.create(
      {
        user_id: studentId,
        id_teacher: assignment.id_teacher,
        id_course: normalizedCourseId,
        date: todayDateKey,
        status: attendanceStatus,
        id_session: session.id_session
      },
      { transaction: t }
    );

    if (session.status === "CLOSED") {
      await t.rollback();
      return res.status(409).json({
        error: "La asistencia de esta clase ya está cerrada.",
        id_session: session.id_session,
        session_status: "CLOSED"
      });
    }
    // Verificar que el alumno esté inscrito en el curso
    const enrollment = await Enrollment.findOne({
      where: { user_id: studentId, id_course: normalizedCourseId },
      transaction: t
    });
    if (!enrollment) {
      await t.rollback();
      return res.status(404).json({ error: "El alumno no está inscrito en este curso." });
    }

    // Registro unico para cada alumno dentro de la misma sesión.
    const existing = await Attendance.findOne({
      where: {
        user_id: studentId,
        id_session: session.id_session
      },
      transaction: t
    });

    if (existing) {
      await t.rollback();
      return res.status(409).json({
        error: "La asistencia ya fue registrada en esta sesión.",
        session: {
          id_session: session.id_session,
          status: session.status
        }
      });
    }

    const attendance = await Attendance.create(
      {
        user_id: studentId,
        id_teacher: assignment.id_teacher,
        id_course: normalizedCourseId,
        date: today,
        status: attendanceStatus,
        id_session: session.id_session
      },
      { transaction: t }
    );

    await t.commit();
    return res.status(201).json({
      message: attendanceStatus === "late"
        ? "Asistencia registrada como retardo."
        : "Asistencia registrada correctamente.",
      attendance,
      session: {
        id_session: session.id_session,
        status: session.status
      }
    });
  } catch (err) {
    await t.rollback();
    console.error("takeAttendanceByQr error:", {
      message: err?.message,
      name: err?.name,
      parent: err?.parent?.message,
      original: err?.original?.message,
      sql: err?.sql
    });
    return res.status(500).json({ error: "Error interno al registrar asistencia." });
  }
};

/* ======================================================
   CERRAR ASISTENCIA Y CREAR FALTAS
   ====================================================== */
const closeAttendance = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const teacherId = req.user?.id;
    const { id_course, date } = req.body;

    if (!teacherId) {
      await t.rollback();
      return res.status(401).json({ error: "No autenticado." });
    }

    if (!id_course || !date) {
      await t.rollback();
      return res.status(400).json({ error: "Faltan datos: id_course y date son obligatorios." });
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date))) {
      await t.rollback();
      return res.status(400).json({ error: "La fecha debe tener formato YYYY-MM-DD." });
    }

    const [y, m, d] = String(date).split("-").map(Number);
    const testDate = new Date(y, m - 1, d);
    if (
      testDate.getFullYear() !== y ||
      testDate.getMonth() !== m - 1 ||
      testDate.getDate() !== d
    ) {
      await t.rollback();
      return res.status(400).json({ error: "La fecha no es válida." });
    }

    const assignment = await InfoTeacher.findOne({
      where: { user_id: teacherId, id_course: Number(id_course) },
      include: [
        {
          model: Course,
          as: "course",
          attributes: ["id_course", "name_subject"]
        }
      ],
      transaction: t
    });
    if (!assignment) {
      await t.rollback();
      return res.status(403).json({ error: "No estás asignado a este curso." });
    }

    const enrollments = await Enrollment.findAll({
      where: { id_course: Number(id_course) },
      attributes: ["user_id"],
      transaction: t
    });

    const startDay = new Date(y, m - 1, d, 0, 0, 0, 0);
    const endDay = new Date(y, m - 1, d, 23, 59, 59, 999);

    const attendanceRows = await Attendance.findAll({
      where: {
        id_course: Number(id_course),
        id_teacher: assignment.id_teacher,
        date: { [Op.between]: [startDay, endDay] }
      },
      attributes: ["user_id"],
      transaction: t
    });

    const recordedIds = new Set(attendanceRows.map(row => Number(row.user_id)));
    const missingIds = enrollments
      .map(row => Number(row.user_id))
      .filter(userId => !recordedIds.has(userId));

    let created = [];
    if (missingIds.length > 0) {
      created = await Attendance.bulkCreate(
        missingIds.map(user_id => ({
          user_id,
          id_teacher: assignment.id_teacher,
          id_course: Number(id_course),
          date: startDay,
          status: "absent"
        })),
        { transaction: t }
      );

      await Notification.bulkCreate(
        missingIds.map(user_id => ({
          user_id,
          title: "Falta registrada",
          message: `Faltaste a la clase de ${assignment.course?.name_subject || `Curso ${id_course}`} el ${date}.`,
          type: "attendance",
          is_read: false,
          created_at: new Date()
        })),
        { transaction: t }
      );
    }

    const createdUserIds = created.map(row => Number(row.user_id)).filter(Boolean);
    const notificationPayload = {
      student_emails_sent: 0,
      student_emails_skipped: 0,
      tutor_emails_sent: 0,
      tutor_emails_unavailable: []
    };

    let studentNotificationRows = [];
    if (createdUserIds.length > 0) {
      studentNotificationRows = await User.findAll({
        where: { id: { [Op.in]: createdUserIds } },
        attributes: ["id", "email"],
        include: [
          {
            model: DtInfo,
            as: "profile",
            attributes: ["name", "lastname", "phone"],
            required: false
          }
        ],
        transaction: t
      });
    }

    const absenceCounts = createdUserIds.length > 0
      ? await Attendance.findAll({
        where: {
          id_course: Number(id_course),
          user_id: { [Op.in]: createdUserIds },
          status: "absent"
        },
        attributes: [
          "user_id",
          [sequelize.fn("COUNT", sequelize.col("id_attendance")), "absence_count"]
        ],
        group: ["user_id"],
        transaction: t
      })
      : [];

    const absenceCountMap = new Map(
      absenceCounts.map(row => [Number(row.user_id), Number(row.get("absence_count") || 0)])
    );

    await t.commit();

    for (const student of studentNotificationRows) {
      const studentName = `${student.profile?.name || ""} ${student.profile?.lastname || ""}`.trim() || student.email;
      try {
        const mailResult = await sendMailSafe({
          to: student.email,
          subject: "ScanQClass: se registró una inasistencia",
          text: `Hola ${studentName}. Se registró una inasistencia en tu curso ${id_course} el día ${date}.`,
          html: `<p>Hola <strong>${studentName}</strong>.</p><p>Se registró una <strong>inasistencia</strong> en tu curso <strong>${id_course}</strong> el día <strong>${date}</strong>.</p>`
        });
        if (mailResult.sent) notificationPayload.student_emails_sent += 1;
        else notificationPayload.student_emails_skipped += 1;
      } catch (err) {
        console.error("student absence mail error:", err);
        notificationPayload.student_emails_skipped += 1;
      }

      const absences = absenceCountMap.get(Number(student.id)) || 0;
      if (absences >= 4) {
        notificationPayload.tutor_emails_unavailable.push({
          user_id: student.id,
          student_email: student.email,
          student_name: studentName,
          reason: "No existe correo de tutor en la BD actual. Solo hay teléfono en Dt_info.phone."
        });
      }
    }

    return res.status(200).json({
      message: "Cierre de asistencia completado.",
      total_inscritos: enrollments.length,
      ya_registrados: recordedIds.size,
      ausentes_creados: created.length,
      mail_notifications: notificationPayload,
      mail_configured: isMailConfigured()
    });
  } catch (err) {
    if (!t.finished) await t.rollback();
    console.error("closeAttendance error:", err);
    return res.status(500).json({ error: "Error interno al cerrar la asistencia." });
  }
};

/* ======================================================
   SUBIR PDF DE UN CURSO
   ====================================================== */
const uploadCoursePdf = async (req, res) => {
  try {
    const teacherId = req.user?.id;
    const { id } = req.params;
    const file = req.file;

    if (!teacherId) return res.status(401).json({ error: "No autenticado." });
    if (!id) return res.status(400).json({ error: "Falta el id del curso." });
    if (!file) return res.status(400).json({ error: "No se envió ningún archivo PDF." });

    const assignment = await InfoTeacher.findOne({ where: { user_id: teacherId, id_course: Number(id) } });
    if (!assignment) {
      return res.status(403).json({ error: "No estás asignado a este curso." });
    }

    const pdf = await Pdf.create({
      id_course: Number(id),
      filename: file.originalname,
      mime_type: file.mimetype,
      file_data: file.buffer
    });

    return res.status(201).json({
      message: "PDF subido correctamente.",
      pdf: {
        id: pdf.id,
        id_course: pdf.id_course,
        filename: pdf.filename,
        mime_type: pdf.mime_type,
        uploaded_at: pdf.uploaded_at
      }
    });
  } catch (err) {
    console.error("uploadCoursePdf error:", err);
    return res.status(500).json({ error: "Error al subir el PDF." });
  }
};

/* ======================================================
   LISTAR PDFS DE UN CURSO
   ====================================================== */
const listClassPdfs = async (req, res) => {
  try {
    const teacherId = req.user?.id;
    const { id } = req.params;

    if (!teacherId) return res.status(401).json({ error: "No autenticado." });
    if (!id) return res.status(400).json({ error: "Falta el id del curso." });

    const pdfs = await Pdf.findAll({
      where: { id_course: Number(id) },
      attributes: ["id", "id_course", "filename", "mime_type", "uploaded_at"],
      order: [["uploaded_at", "DESC"]]
    });

    return res.status(200).json(pdfs);
  } catch (err) {
    console.error("listClassPdfs error:", err);
    return res.status(500).json({ error: "Error al obtener los PDFs del curso." });
  }
};

/* ======================================================
   DESCARGAR PDF DE UN CURSO
   ====================================================== */
const downloadClassPdf = async (req, res) => {
  try {
    const teacherId = req.user?.id;
    const { id, pdfId } = req.params;

    if (!teacherId) return res.status(401).json({ error: "No autenticado." });
    if (!id || !pdfId) return res.status(400).json({ error: "Faltan id del curso o id del PDF." });

    const assignment = await InfoTeacher.findOne({
      where: { user_id: teacherId, id_course: Number(id) }
    });
    if (!assignment) {
      return res.status(403).json({ error: "No estás asignado a este curso." });
    }

    const pdf = await Pdf.findOne({
      where: { id: Number(pdfId), id_course: Number(id) }
    });
    if (!pdf) {
      return res.status(404).json({ error: "PDF no encontrado para este curso." });
    }

    res.setHeader("Content-Type", pdf.mime_type || "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${pdf.filename || `curso-${id}.pdf`}"`); return res.send(pdf.file_data);
  } catch (err) {
    console.error("downloadClassPdf error:", err);
    return res.status(500).json({ error: "Error al descargar el PDF." });
  }
};

/* ======================================================
   ELIMINAR PDF DE UN CURSO
   ====================================================== */
const deleteClassPdf = async (req, res) => {
  try {
    const teacherId = req.user?.id;
    const { id, pdfId } = req.params;

    if (!teacherId) return res.status(401).json({ error: "No autenticado." });
    if (!id || !pdfId) return res.status(400).json({ error: "Faltan id del curso o id del PDF." });

    const assignment = await InfoTeacher.findOne({
      where: { user_id: teacherId, id_course: Number(id) }
    });
    if (!assignment) {
      return res.status(403).json({ error: "No estás asignado a este curso." });
    }

    const pdf = await Pdf.findOne({
      where: { id: Number(pdfId), id_course: Number(id) }
    });
    if (!pdf) {
      return res.status(404).json({ error: "PDF no encontrado para este curso." });
    }

    await pdf.destroy();
    return res.status(200).json({ message: "PDF eliminado correctamente." });
  } catch (err) {
    console.error("deleteClassPdf error:", err);
    return res.status(500).json({ error: "Error al eliminar el PDF." });
  }
};

/* ======================================================
   HISTORIAL MENSUAL DE ASISTENCIA POR CURSO
   ====================================================== */
const getClassHistory = async (req, res) => {
  try {
    const teacherId = req.user?.id;
    const { id } = req.params;
    const { month } = req.query; // formato: YYYY-MM

    if (!teacherId) return res.status(401).json({ error: "No autenticado." });
    if (!id) return res.status(400).json({ error: "Falta el id del curso." });
    const assignment = await InfoTeacher.findOne({
      where: { user_id: teacherId, id_course: Number(id) }
    });
    if (!assignment) {
      return res.status(403).json({ error: "No estás asignado a este curso." });
    }

    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ error: "Debes enviar el mes en formato YYYY-MM. Ejemplo: 2026-03" });
    }

    const [year, monthNum] = month.split("-").map(Number);
    if (monthNum < 1 || monthNum > 12) {
      return res.status(400).json({ error: "El mes no es válido." });
    }
    const startDate = new Date(year, monthNum - 1, 1, 0, 0, 0, 0);
    const endDate = new Date(year, monthNum, 0, 23, 59, 59, 999);

    const course = await Course.findByPk(id, {
      attributes: ["id_course", "name_subject"]
    });
    if (!course) return res.status(404).json({ error: "Curso no encontrado." });

    const attendanceRows = await Attendance.findAll({
      where: {
        id_course: id,
        id_teacher: assignment.id_teacher,
        date: { [Op.between]: [startDate, endDate] }
      },
      attributes: [
        "id_attendance",
        "user_id",
        "date",
        "status",
        "justification_text",
        "justification_image",
        "justification_status",
        "justification_ai_result",
        "justification_ai_score",
        "justification_ai_comment",
        "justified_at",
        [sequelize.fn("DATE_FORMAT", sequelize.col("date"), "%Y-%m-%d"), "date_key"]
      ],
      order: [["date", "ASC"]]
    });

    const enrollments = await Enrollment.findAll({
      where: { id_course: id },
      attributes: ["user_id"]
    });

    let studentIds = enrollments.map(e => e.user_id);
    if (studentIds.length === 0) {
      studentIds = [...new Set(attendanceRows.map(a => a.user_id))];
    }
    studentIds = [...new Set(studentIds)];

    const profiles = await DtInfo.findAll({
      where: { user_id: { [Op.in]: studentIds.length ? studentIds : [0] } },
      attributes: ["user_id", "name", "lastname"]
    });

    const profileMap = {};
    for (const p of profiles) {
      profileMap[p.user_id] = `${p.name || ""} ${p.lastname || ""}`.trim();
    }

    const uniqueDates = [
      ...new Set(attendanceRows.map(row => String(row.get("date_key") || "")))
    ].filter(Boolean);

    const studentMap = {};
    for (const userId of studentIds) {
      studentMap[userId] = {
        user_id: userId,
        nombre: profileMap[userId] || `Alumno ${userId}`,
        asistencias: {}
      };
    }

    for (const row of attendanceRows) {
      const dateKey = String(row.get("date_key") || "");
      if (!dateKey) continue;
      if (!studentMap[row.user_id]) {
        studentMap[row.user_id] = {
          user_id: row.user_id,
          nombre: profileMap[row.user_id] || `Alumno ${row.user_id}`,
          asistencias: {}
        };
      }
      const justificationRequest = parseJustificationRequest(row.justification_text);
      const reviewStatus = getJustificationReviewStatus(row);
      const displayStatus = row.status === "absent" && reviewStatus === "pending"
        ? "pending"
        : row.status === "absent" && reviewStatus === "accepted"
          ? "justified"
          : row.status;
      studentMap[row.user_id].asistencias[dateKey] = {
        status: row.status,
        display_status: displayStatus,
        justification_text: getJustificationOriginalText(row),
        justification_image: row.justification_image || null,
        justification_image_url: row.justification_image ? `/attendance/justifications/${row.id_attendance}/image` : null,
        justification_ai_result: getJustificationAiResult(row),
        justification_ai_score: getJustificationAiScore(row),
        justification_ai_comment: getJustificationAiComment(row),
        justification_request: {
          ...(justificationRequest && justificationRequest.format === "scanq-justification-v1" ? justificationRequest : {}),
          original_text: getJustificationOriginalText(row),
          review_status: reviewStatus,
          ai_category: getJustificationAiResult(row),
          ai_confidence: getJustificationAiScore(row),
          ai_comment: getJustificationAiComment(row)
        },
        justified_at: row.justified_at || null
      };
    }

    return res.status(200).json({
      curso: { id_course: course.id_course, name_subject: course.name_subject },
      month,
      fechas: uniqueDates,
      alumnos: Object.values(studentMap)
    });
  } catch (err) {
    console.error("getClassHistory error:", err);
    return res.status(500).json({ error: "Error al obtener el historial de asistencia." });
  }
};

/* ======================================================
   JUSTIFICAR FALTAS
   ====================================================== */
const justifyAttendance = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const teacherId = req.user?.id;
    const { user_id, id_course, date, justification_text, action } = req.body;

    if (!teacherId) {
      await t.rollback();
      return res.status(401).json({ error: "No autenticado." });
    }

    if (!user_id || !id_course || !date) {
      await t.rollback();
      return res.status(400).json({ error: "Faltan datos: user_id, id_course y date son obligatorios." });
    }

    // Verificar que el maestro esté asignado al curso
    const assignment = await InfoTeacher.findOne({
      where: { user_id: teacherId, id_course: Number(id_course) },
      transaction: t
    });
    if (!assignment) {
      await t.rollback();
      return res.status(403).json({ error: "No estás asignado a este curso." });
    }

    // Buscar el registro de asistencia del día
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date))) {
      await t.rollback();
      return res.status(400).json({ error: "La fecha debe tener formato YYYY-MM-DD." });
    }

    const [y, m, d] = String(date).split("-").map(Number);
    const testDate = new Date(y, m - 1, d);

    if (
      testDate.getFullYear() !== y ||
      testDate.getMonth() !== m - 1 ||
      testDate.getDate() !== d
    ) {
      await t.rollback();
      return res.status(400).json({ error: "La fecha no es válida." });
    }
    const startDay = new Date(y, m - 1, d, 0, 0, 0, 0);
    const endDay = new Date(y, m - 1, d, 23, 59, 59, 999);

    const record = await Attendance.findOne({
      where: {
        user_id: Number(user_id),
        id_course: Number(id_course),
        date: { [Op.between]: [startDay, endDay] }
      },
      transaction: t
    });

    if (!record) {
      await t.rollback();
      return res.status(404).json({ error: "No se encontró un registro de asistencia para ese alumno, curso y fecha." });
    }

    if (record.status !== "absent") {
      await t.rollback();
      return res.status(409).json({ error: `El registro ya tiene estado "${record.status}". Solo se pueden justificar inasistencias.` });
    }

    const existingRequest = parseJustificationRequest(record.justification_text);
    const reviewStatus = getJustificationReviewStatus(record);

    if (action === "accept" || action === "reject") {
      if (!getJustificationOriginalText(record) || reviewStatus !== "pending") {
        await t.rollback();
        return res.status(409).json({ error: "No existe una solicitud de justificación enviada por el alumno para este registro." });
      }

      if (action === "accept") {
        const now = new Date();
        await record.update(
          {
            status: "justified",
            justification_status: "APPROVED",
            justified_by: teacherId,
            justified_at: now
          },
          { transaction: t }
        );
      } else {
        await record.update(
          {
            status: "absent",
            justification_status: "REJECTED"
          },
          { transaction: t }
        );
      }

      await t.commit();
      return res.status(200).json({
        message: action === "accept"
          ? "Justificación aceptada correctamente."
          : "Justificación rechazada correctamente."
      });
    }

    if (!justification_text || String(justification_text).trim().length < 3) {
      await t.rollback();
      return res.status(400).json({ error: "Debes ingresar un motivo de justificación (mínimo 3 caracteres)." });
    }

    await record.update(
      {
        status: "justified",
        justification_text: String(justification_text).trim(),
        justification_status: "APPROVED",
        justified_by: teacherId,
        justified_at: new Date()
      },
      { transaction: t }
    );

    await t.commit();
    return res.status(200).json({ message: "Inasistencia justificada correctamente." });
  } catch (err) {
    if (!t.finished) await t.rollback();
    console.error("justifyAttendance error:", err);
    return res.status(500).json({ error: "Error interno al justificar la asistencia." });
  }
};

const approveJustificationRequest = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const teacherId = req.user?.id;
    const attendanceId = Number(req.params.id);

    if (!teacherId) {
      await t.rollback();
      return res.status(401).json({ error: "No autenticado." });
    }

    if (!Number.isFinite(attendanceId) || attendanceId <= 0) {
      await t.rollback();
      return res.status(400).json({ error: "El id de la asistencia no es válido." });
    }

    const record = await Attendance.findByPk(attendanceId, { transaction: t });
    if (!record) {
      await t.rollback();
      return res.status(404).json({ error: "Solicitud no encontrada." });
    }

    const assignment = await InfoTeacher.findOne({
      where: { user_id: teacherId, id_course: Number(record.id_course), id_teacher: Number(record.id_teacher) },
      transaction: t
    });
    if (!assignment) {
      await t.rollback();
      return res.status(403).json({ error: "No estás asignado a este curso." });
    }

    const request = parseJustificationRequest(record.justification_text);
    if (!getJustificationOriginalText(record) || getJustificationReviewStatus(record) !== "pending") {
      await t.rollback();
      return res.status(409).json({ error: "La solicitud ya no está pendiente." });
    }

    const now = new Date();
    await record.update({
      status: "justified",
      justification_status: "APPROVED",
      justified_by: teacherId,
      justified_at: now
    }, { transaction: t });

    await t.commit();
    return res.status(200).json({ message: "Justificación aceptada correctamente." });
  } catch (err) {
    if (!t.finished) await t.rollback();
    console.error("approveJustificationRequest error:", err);
    return res.status(500).json({ error: "Error al aceptar la justificación." });
  }
};

const rejectJustificationRequest = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const teacherId = req.user?.id;
    const attendanceId = Number(req.params.id);

    if (!teacherId) {
      await t.rollback();
      return res.status(401).json({ error: "No autenticado." });
    }

    if (!Number.isFinite(attendanceId) || attendanceId <= 0) {
      await t.rollback();
      return res.status(400).json({ error: "El id de la asistencia no es válido." });
    }

    const record = await Attendance.findByPk(attendanceId, { transaction: t });
    if (!record) {
      await t.rollback();
      return res.status(404).json({ error: "Solicitud no encontrada." });
    }

    const assignment = await InfoTeacher.findOne({
      where: { user_id: teacherId, id_course: Number(record.id_course), id_teacher: Number(record.id_teacher) },
      transaction: t
    });
    if (!assignment) {
      await t.rollback();
      return res.status(403).json({ error: "No estás asignado a este curso." });
    }

    const request = parseJustificationRequest(record.justification_text);
    if (!getJustificationOriginalText(record) || getJustificationReviewStatus(record) !== "pending") {
      await t.rollback();
      return res.status(409).json({ error: "La solicitud ya no está pendiente." });
    }

    await record.update({
      status: "absent",
      justification_status: "REJECTED"
    }, { transaction: t });

    await t.commit();
    return res.status(200).json({ message: "Justificación rechazada correctamente." });
  } catch (err) {
    if (!t.finished) await t.rollback();
    console.error("rejectJustificationRequest error:", err);
    return res.status(500).json({ error: "Error al rechazar la justificación." });
  }
};

/* ======================================================
   OBTENER SESIÓN DEL DÍA PARA UN CURSO
   ====================================================== */
const getSessionToday = async (req, res) => {
  try {
    const teacherId = req.user?.id;
    const id_course = Number(req.query.id_course);

    if (!teacherId) return res.status(401).json({ error: "No autenticado." });
    if (!Number.isFinite(id_course) || id_course <= 0) {
      return res.status(400).json({ error: "id_course no válido." });
    }

    const serverNow = new Date();
    const nowInSeconds = getMexicoNowInSeconds(serverNow);
    const dayName = getCurrentMexicoDayName(serverNow);
    const todaySchedules = await CourseSchedule.findAll({
      where: {
        id_course,
        day_of_week: dayName
      },
      attributes: ["id_schedule", "start_time", "end_time"],
      order: [["start_time", "ASC"]]
    });

    if (todaySchedules.length === 0) {
      return res.status(200).json({ session: null });
    }

    const resolvedSchedule = resolveActiveSchedule(
      todaySchedules,
      nowInSeconds,
      `getSessionToday course=${id_course}`
    );
    const today = formatDateKeyMexico(serverNow);

    const session = await AttendanceSession.findOne({
      where: {
        id_course,
        id_teacher: teacherId,
        id_schedule: resolvedSchedule.id_schedule,
        date: today
      },
      order: [["opened_at", "DESC"]]
    });

    return res.status(200).json({
      session: session
        ? {
          id_session: session.id_session,
          status: session.status,
          opened_at: session.opened_at,
          closed_at: session.closed_at
        }
        : null
    });
  } catch (err) {
    console.error("getSessionToday error:", err);
    return res.status(500).json({ error: "Error al obtener la sesión." });
  }
};

/* ======================================================
   CERRAR SESIÓN DE ASISTENCIA
   ====================================================== */
const closeAttendanceSession = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const teacherId = req.user?.id;
    const sessionIdNum = Number(req.params.id_session);

    if (!teacherId) {
      await t.rollback();
      return res.status(401).json({ error: "No autenticado." });
    }

    if (!Number.isFinite(sessionIdNum) || sessionIdNum <= 0) {
      await t.rollback();
      return res.status(400).json({ error: "id_session no es válido." });
    }
    // Cargar y validar la sesión 
    const session = await AttendanceSession.findByPk(sessionIdNum, { transaction: t });

    if (!session) {
      await t.rollback();
      return res.status(404).json({ error: "Sesión de asistencia no encontrada." });
    }
    if (Number(session.id_teacher) !== Number(teacherId)) {
      await t.rollback();
      return res.status(403).json({ error: "No puedes cerrar la sesión de otro maestro." });
    }

    if (session.status === "CLOSED") {
      await t.rollback();
      return res.status(409).json({ error: "Esta sesión ya está cerrada." });
    }
    const today = formatDateKeyMexico(new Date());
    const sessionDate = typeof session.date === "string"
      ? session.date.slice(0, 10)
      : formatDateKeyMexico(session.date);

    if (sessionDate !== today) {
      await t.rollback();
      return res.status(403).json({
        error: "Solo puedes cerrar asistencia el mismo día de la clase."
      });
    }
    const assignment = await InfoTeacher.findOne({
      where: {
        user_id: Number(teacherId),
        id_course: Number(session.id_course)
      },
      attributes: ["id_teacher"],
      transaction: t
    });

    if (!assignment) {
      await t.rollback();
      return res.status(400).json({
        error: "No se encontró la asignación del maestro a este curso. No se puede cerrar la sesión."
      });
    }

    const legacyTeacherId = assignment.id_teacher;
    const enrollments = await Enrollment.findAll({
      where: { id_course: Number(session.id_course) },
      attributes: ["user_id"],
      transaction: t
    });

    const enrolledUserIds = enrollments.map(e => Number(e.user_id));
    const totalEnrolled = enrolledUserIds.length;

    const existingRows = await Attendance.findAll({
      where: { id_session: sessionIdNum },
      attributes: ["user_id"],
      transaction: t
    });

    const attendedSet = new Set(existingRows.map(a => Number(a.user_id)));
    const existingRecords = attendedSet.size;

    // Crear faltas para alumnos sin registro
    const absenceDate = new Date(sessionDate + "T00:00:00.000Z");

    const absentRows = enrolledUserIds
      .filter(uid => !attendedSet.has(uid))
      .map(uid => ({
        user_id: uid,
        id_teacher: legacyTeacherId,
        id_course: Number(session.id_course),
        date: absenceDate,
        status: "absent",
        id_session: sessionIdNum
      }));

    const absencesCreated = absentRows.length;

    if (absencesCreated > 0) {
      await Attendance.bulkCreate(absentRows, {
        validate: true,
        transaction: t
      });
    }

    //Cerrar la sesión
    const closedAt = new Date();
    await session.update(
      { status: "CLOSED", closed_at: closedAt, closed_by: teacherId },
      { transaction: t }
    );

    await t.commit();
    return res.status(200).json({
      message: "Asistencia cerrada correctamente.",
      session: {
        id_session: session.id_session,
        status: "CLOSED",
        closed_at: closedAt
      },
      summary: {
        totalEnrolled,
        existingRecords,
        absencesCreated
      }
    });
  } catch (err) {
    await t.rollback();
    console.error("closeAttendanceSession error:", err);
    return res.status(500).json({ error: "Error interno al cerrar la sesión." });
  }
};

module.exports = {
  getTeacherDashboard,
  getMyClasses,
  getPendingJustifications,
  takeAttendanceByQr,
  closeAttendanceSession,
  getSessionToday,
  uploadCoursePdf,
  listClassPdfs,
  downloadClassPdf,
  deleteClassPdf,
  getClassHistory,
  justifyAttendance,
  approveJustificationRequest,
  rejectJustificationRequest
};
