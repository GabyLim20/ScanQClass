const { Op } = require("sequelize");
const { User, Course, Attendance, Enrollment, InfoTeacher, DtInfo, Section, CourseSchedule } = require("../../models");

const DAY_ORDER = {
  Lunes: 1,
  Martes: 2,
  Miercoles: 3,
  Jueves: 4,
  Viernes: 5,
  Sabado: 6
};

function getTeacherDisplayName(teacher) {
  const name = `${teacher?.profile?.name || ""} ${teacher?.profile?.lastname || ""}`.trim();
  return name || teacher?.email || "Maestro sin nombre";
}

function getNextScheduleCandidate(courses) {
  const now = new Date();
  const currentDay = now.getDay() === 0 ? 7 : now.getDay();
  const currentMinutes = (now.getHours() * 60) + now.getMinutes();
  let best = null;

  for (const course of courses) {
    for (const schedule of course.schedules || []) {
      const scheduleDay = DAY_ORDER[schedule.day_of_week];
      if (!scheduleDay) continue;

      const [hours = 0, minutes = 0] = String(schedule.start_time || "00:00:00").split(":").map(Number);
      const scheduleMinutes = (hours * 60) + minutes;
      let offsetDays = scheduleDay - currentDay;
      if (offsetDays < 0 || (offsetDays === 0 && scheduleMinutes < currentMinutes)) {
        offsetDays += 7;
      }

      const rank = (offsetDays * 1440) + scheduleMinutes;
      if (!best || rank < best.rank) {
        best = { course, schedule, rank };
      }
    }
  }

  return best;
}

const getDashboardStats = async (req, res) => {
  try {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const endOfDay   = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    const [
      totalStudents,
      totalTeachers,
      totalCourses,
      todayAttendance,
      totalEnrollments,
      teachersRaw,
      coursesWithSchedules
    ] = await Promise.all([
      User.count({ where: { level: 3 } }),
      User.count({ where: { level: 2 } }),
      Course.count(),
      Attendance.count({ where: { date: { [Op.between]: [startOfDay, endOfDay] } } }),
      Enrollment.count(),
      User.findAll({
        where: { level: 2 },
        attributes: ["id", "email"],
        include: [
          { model: DtInfo, as: "profile", attributes: ["name", "lastname"], required: false },
          {
            model: InfoTeacher,
            as: "teacherCourses",
            attributes: ["id_course"],
            required: false,
            include: [
              { model: Course, as: "course", attributes: ["id_course", "name_subject"], required: false }
            ]
          }
        ]
      }),
      Course.findAll({
        attributes: ["id_course", "name_subject"],
        include: [
          { model: Section, as: "section", attributes: ["name"], required: false },
          { model: Enrollment, as: "enrollments", attributes: ["id_enrollment"], required: false },
          { model: CourseSchedule, as: "schedules", attributes: ["day_of_week", "start_time", "end_time"], required: false }
        ]
      })
    ]);

    const featuredTeachers = teachersRaw
      .map((teacher) => ({
        id: teacher.id,
        name: getTeacherDisplayName(teacher),
        email: teacher.email,
        courseCount: Array.isArray(teacher.teacherCourses) ? teacher.teacherCourses.length : 0,
        primaryCourse: teacher.teacherCourses?.[0]?.course?.name_subject || ""
      }))
      .sort((a, b) => b.courseCount - a.courseCount || a.name.localeCompare(b.name))
      .slice(0, 2);

    const nextCandidate = getNextScheduleCandidate(coursesWithSchedules);
    const fallbackCourse = nextCandidate?.course || coursesWithSchedules[0] || null;
    const fallbackSchedule = nextCandidate?.schedule || fallbackCourse?.schedules?.[0] || null;
    const upcomingClass = fallbackCourse ? {
      name_subject: fallbackCourse.name_subject || "Clase sin nombre",
      section_name: fallbackCourse.section?.name || "Sin sección",
      schedule_label: fallbackSchedule
        ? `${fallbackSchedule.day_of_week} ${String(fallbackSchedule.start_time || "").slice(0, 5)}-${String(fallbackSchedule.end_time || "").slice(0, 5)}`
        : "Horario no disponible",
      enrollment_count: Array.isArray(fallbackCourse.enrollments) ? fallbackCourse.enrollments.length : 0
    } : null;

    return res.status(200).json({
      totalStudents,
      totalTeachers,
      totalCourses,
      todayAttendance,
      totalEnrollments,
      featuredTeachers,
      upcomingClass
    });
  } catch (err) {
    console.error("getDashboardStats error:", err);
    return res.status(500).json({ error: "Error interno del servidor." });
  }
};

module.exports = { getDashboardStats };
