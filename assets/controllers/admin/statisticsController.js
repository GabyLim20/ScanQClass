const { Op } = require("sequelize");
const {
  Enrollment,
  Attendance,
  User,
  DtInfo,
  InfoStudent,
  Section,
  Course
} = require("../../models");
const { getJustificationReviewStatus } = require("../../utils/justificationAI");

function getMonthRange(month) {
  const fallback = new Date();
  const raw = /^\d{4}-\d{2}$/.test(String(month || "")) ? String(month) : `${fallback.getFullYear()}-${String(fallback.getMonth() + 1).padStart(2, "0")}`;
  const [year, monthNum] = raw.split("-").map(Number);
  const start = new Date(year, monthNum - 1, 1, 0, 0, 0, 0);
  const end = new Date(year, monthNum, 0, 23, 59, 59, 999);
  return { month: raw, start, end };
}

function isAttendanceCredit(status) {
  return status === "present" || status === "late" || status === "justified";
}

function getAttendanceStatus(row) {
  if (row?.status === "absent" && getJustificationReviewStatus(row) === "accepted") {
    return "justified";
  }
  return row?.status;
}

function countAttendance(rows = []) {
  const counts = {
    total_records: rows.length,
    attendance_count: 0,
    present_count: 0,
    late_count: 0,
    absent_count: 0,
    justified_count: 0
  };

  rows.forEach(row => {
    const status = getAttendanceStatus(row);
    if (isAttendanceCredit(status)) counts.attendance_count += 1;
    if (status === "present") counts.present_count += 1;
    else if (status === "late") counts.late_count += 1;
    else if (status === "absent") counts.absent_count += 1;
    else if (status === "justified") counts.justified_count += 1;
  });

  return counts;
}

function calculateTrend(rows = []) {
  if (rows.length < 4) return "stable";

  const sorted = [...rows].sort((a, b) => new Date(a.date) - new Date(b.date));
  const mid = Math.floor(sorted.length / 2);
  const firstHalf = sorted.slice(0, mid);
  const secondHalf = sorted.slice(mid);

  const firstRate = firstHalf.length
    ? firstHalf.filter(row => isAttendanceCredit(getAttendanceStatus(row))).length / firstHalf.length
    : 0;
  const secondRate = secondHalf.length
    ? secondHalf.filter(row => isAttendanceCredit(getAttendanceStatus(row))).length / secondHalf.length
    : 0;

  const diff = secondRate - firstRate;
  if (diff >= 0.15) return "up";
  if (diff <= -0.15) return "down";
  return "stable";
}

function calculateRisk(counts, rows, periodEnd) {
  const attendanceBase = counts.total_records > 0
    ? (counts.attendance_count / counts.total_records) * 100
    : 0;
  const latePercentage = counts.total_records > 0
    ? (counts.late_count / counts.total_records) * 100
    : 0;

  const trend = calculateTrend(rows);
  const recentStart = new Date(periodEnd.getTime() - (14 * 24 * 60 * 60 * 1000));
  const recentAbsences = rows.filter(row => getAttendanceStatus(row) === "absent" && new Date(row.date) >= recentStart).length;

  let riskScore = 0;
  if (attendanceBase < 70) riskScore += 60;
  else if (attendanceBase < 85) riskScore += 30;

  if (recentAbsences >= 3) riskScore += 25;
  else if (counts.absent_count >= 3) riskScore += 15;

  if (latePercentage >= 25) riskScore += 15;
  else if (latePercentage >= 10) riskScore += 8;

  if (trend === "down") riskScore += 20;
  else if (trend === "stable") riskScore += 5;

  let riskLevel = "Bajo";
  if (attendanceBase < 70 || recentAbsences >= 3 || riskScore >= 70) {
    riskLevel = "Alto";
  } else if ((attendanceBase >= 70 && attendanceBase <= 85) || latePercentage >= 10 || riskScore >= 40) {
    riskLevel = "Medio";
  }

  return {
    attendance_percentage: Number(attendanceBase.toFixed(2)),
    late_percentage: Number(latePercentage.toFixed(2)),
    trend,
    risk_score: riskScore,
    risk_level: riskLevel
  };
}

const getAttendanceRiskStatistics = async (req, res) => {
  try {
    const { id_section, id_course, month } = req.query;
    const normalizedSectionId = id_section ? Number(id_section) : null;
    const normalizedCourseId = id_course ? Number(id_course) : null;
    const { month: normalizedMonth, start, end } = getMonthRange(month);

    const enrollmentWhere = {};
    if (normalizedCourseId) enrollmentWhere.id_course = normalizedCourseId;

    const courseWhere = {};
    if (normalizedSectionId) courseWhere.id_section = normalizedSectionId;
    if (normalizedCourseId) courseWhere.id_course = normalizedCourseId;

    const enrollments = await Enrollment.findAll({
      where: enrollmentWhere,
      attributes: ["user_id", "id_course"],
      include: [
        {
          model: User,
          as: "student",
          attributes: ["id", "email"],
          required: true,
          include: [
            { model: DtInfo, as: "profile", attributes: ["name", "lastname"] },
            {
              model: InfoStudent,
              as: "studentInfo",
              required: Boolean(normalizedSectionId),
              where: normalizedSectionId ? { id_section: normalizedSectionId } : undefined,
              attributes: ["student_code", "id_section"],
              include: [{ model: Section, as: "section", attributes: ["id_section", "name"] }]
            }
          ]
        },
        {
          model: Course,
          as: "course",
          attributes: ["id_course", "name_subject", "id_section"],
          where: normalizedCourseId ? courseWhere : {},
          required: true,
          include: [{ model: Section, as: "section", attributes: ["id_section", "name"], required: false }]
        }
      ],
      order: [["id_course", "ASC"], ["user_id", "ASC"]]
    });

    if (!enrollments.length) {
      return res.status(200).json({
        filters: { id_section: normalizedSectionId, id_course: normalizedCourseId, month: normalizedMonth },
        items: [],
        summary: {
          high_count: 0,
          medium_count: 0,
          low_count: 0,
          average_attendance: 0
        },
        by_section: []
      });
    }

    const userIds = [...new Set(enrollments.map(row => Number(row.user_id)).filter(Boolean))];
    const courseIds = [...new Set(enrollments.map(row => Number(row.id_course)).filter(Boolean))];

    const attendanceRows = await Attendance.findAll({
      where: {
        user_id: { [Op.in]: userIds },
        id_course: { [Op.in]: courseIds },
        date: { [Op.between]: [start, end] }
      },
      attributes: ["user_id", "id_course", "status", "date", "justification_text"],
      order: [["date", "ASC"]]
    });

    const rowsByUser = new Map();
    attendanceRows.forEach(row => {
      const key = Number(row.user_id);
      if (!rowsByUser.has(key)) rowsByUser.set(key, []);
      rowsByUser.get(key).push(row);
    });

    const uniqueStudents = new Map();
    enrollments.forEach(row => {
      const key = Number(row.user_id);
      if (!uniqueStudents.has(key)) {
        const student = row.student || {};
        const profile = student.profile || {};
        const studentInfo = student.studentInfo || {};
        uniqueStudents.set(key, {
          user_id: key,
          student_code: studentInfo.student_code || null,
          student_name: `${profile.name || ""} ${profile.lastname || ""}`.trim() || student.email || `Alumno ${key}`,
          section_name: studentInfo.section?.name || row.course?.section?.name || "Sin sección"
        });
      }
    });

    const items = Array.from(uniqueStudents.values()).map(student => {
      const studentRows = rowsByUser.get(student.user_id) || [];
      const counts = countAttendance(studentRows);
      const risk = calculateRisk(counts, studentRows, end);
      return {
        ...student,
        ...counts,
        ...risk
      };
    }).sort((a, b) => {
      const riskOrder = { Alto: 0, Medio: 1, Bajo: 2 };
      return (riskOrder[a.risk_level] ?? 9) - (riskOrder[b.risk_level] ?? 9)
        || a.attendance_percentage - b.attendance_percentage
        || a.student_name.localeCompare(b.student_name);
    });

    const summary = {
      high_count: items.filter(item => item.risk_level === "Alto").length,
      medium_count: items.filter(item => item.risk_level === "Medio").length,
      low_count: items.filter(item => item.risk_level === "Bajo").length,
      average_attendance: items.length
        ? Number((items.reduce((sum, item) => sum + item.attendance_percentage, 0) / items.length).toFixed(2))
        : 0
    };

    const sectionMap = new Map();
    items.forEach(item => {
      const key = item.section_name || "Sin sección";
      if (!sectionMap.has(key)) sectionMap.set(key, []);
      sectionMap.get(key).push(item);
    });

    const by_section = Array.from(sectionMap.entries()).map(([section_name, sectionItems]) => ({
      section_name,
      student_count: sectionItems.length,
      average_attendance: Number((sectionItems.reduce((sum, item) => sum + item.attendance_percentage, 0) / sectionItems.length).toFixed(2)),
      high_count: sectionItems.filter(item => item.risk_level === "Alto").length,
      medium_count: sectionItems.filter(item => item.risk_level === "Medio").length,
      low_count: sectionItems.filter(item => item.risk_level === "Bajo").length
    })).sort((a, b) => a.section_name.localeCompare(b.section_name));

    return res.status(200).json({
      filters: { id_section: normalizedSectionId, id_course: normalizedCourseId, month: normalizedMonth },
      items,
      summary,
      by_section
    });
  } catch (err) {
    console.error("getAttendanceRiskStatistics error:", err);
    return res.status(500).json({ error: "Error al obtener el análisis de riesgo de asistencia." });
  }
};

module.exports = { getAttendanceRiskStatistics };
