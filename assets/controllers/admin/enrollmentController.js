const { Op } = require("sequelize");
const {
  sequelize,
  User,
  Course,
  CourseSchedule,
  Section,
  Enrollment,
  DtInfo,
  InfoStudent,
  Attendance
} = require("../../models");

const ROLE_STUDENT = 3;

const enrollSection = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { id_section, id_course } = req.body;

    if (!id_section || !id_course) {
      await t.rollback();
      return res.status(400).json({ error: "Faltan id_section o id_course." });
    }

    const section = await Section.findByPk(id_section, { transaction: t });
    if (!section) {
      await t.rollback();
      return res.status(404).json({ error: "La sección no existe." });
    }

    const course = await Course.findByPk(id_course, {
      attributes: ["id_course", "name_subject"],
      transaction: t
    });
    if (!course) {
      await t.rollback();
      return res.status(404).json({ error: "El curso no existe." });
    }

    const students = await InfoStudent.findAll({
      where: { id_section: Number(id_section) },
      attributes: ["user_id", "student_code"],
      transaction: t
    });

    const userIds = students.map(s => Number(s.user_id)).filter(Boolean);
    const totalStudents = userIds.length;

    if (totalStudents === 0) {
      await t.rollback();
      return res.status(200).json({
        message: "La sección no tiene alumnos para inscribir.",
        total_students: 0,
        created_count: 0,
        skipped_count: 0,
        errors: []
      });
    }

    const existing = await Enrollment.findAll({
      where: {
        id_course: Number(id_course),
        user_id: { [Op.in]: userIds }
      },
      attributes: ["user_id"],
      transaction: t
    });

    const existingUserIds = new Set(existing.map(row => Number(row.user_id)));
    const toCreate = userIds.filter(user_id => !existingUserIds.has(user_id));

    if (toCreate.length > 0) {
      await Enrollment.bulkCreate(
        toCreate.map(user_id => ({
          user_id,
          id_course: Number(id_course)
        })),
        { transaction: t }
      );
    }

    await t.commit();

    return res.status(201).json({
      message: "Proceso de inscripción por sección completado.",
      section: {
        id_section: section.id_section,
        name: section.name
      },
      course: {
        id_course: course.id_course,
        name_subject: course.name_subject
      },
      total_students: totalStudents,
      created_count: toCreate.length,
      skipped_count: totalStudents - toCreate.length,
      errors: []
    });
  } catch (err) {
    await t.rollback();
    console.error("enrollSection error:", err);
    return res.status(500).json({ error: "Error interno del servidor." });
  }
};

const enrollStudent = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { user_id, courses } = req.body;

    if (!user_id) {
      await t.rollback();
      return res.status(400).json({ error: "Falta user_id del alumno." });
    }

const courseIds = Array.isArray(courses)
  ? [...new Set(courses.map(Number).filter(Boolean))]
  : [];    
  if (courseIds.length === 0) {
      await t.rollback();
      return res.status(400).json({ error: "Debes enviar al menos un id_course en el array 'courses'." });
    }

    const student = await User.findByPk(user_id, {
      attributes: ["id", "level", "email"],
      include: [{ model: DtInfo, as: "profile", attributes: ["name", "lastname"] }],
      transaction: t
    });

    if (!student) {
      await t.rollback();
      return res.status(404).json({ error: "Usuario no encontrado." });
    }

    if (student.level !== ROLE_STUDENT) {
      await t.rollback();
      return res.status(400).json({ error: "El usuario no es alumno (nivel 3)." });
    }

    const foundCourses = await Course.findAll({
      where: { id_course: { [Op.in]: courseIds } },
      attributes: ["id_course", "name_subject"],
      transaction: t
    });

    if (foundCourses.length !== courseIds.length) {
      const foundIds = foundCourses.map(c => c.id_course);
      const missing  = courseIds.filter(id => !foundIds.includes(id));
      await t.rollback();
      return res.status(404).json({
        error:   "Uno o más cursos no existen.",
        missing
      });
    }

    const existing = await Enrollment.findAll({
      where: { user_id, id_course: { [Op.in]: courseIds } },
      attributes: ["id_course"],
      transaction: t
    });
    const alreadyEnrolled = existing.map(e => e.id_course);
    const toCreate        = courseIds.filter(id => !alreadyEnrolled.includes(id));

    let created = [];
    if (toCreate.length > 0) {
      created = await Enrollment.bulkCreate(
        toCreate.map(id_course => ({ user_id: Number(user_id), id_course })),
        { transaction: t }
      );
    }

    await t.commit();

    return res.status(201).json({
      message:          "Proceso de inscripción completado.",
      alumno: {
        id:     student.id,
        nombre: `${student.profile?.name || ""} ${student.profile?.lastname || ""}`.trim(),
        email:  student.email
      },
      inscritos:   toCreate,
      omitidos:    alreadyEnrolled, 
      total_nuevo: created.length
    });
  } catch (err) {
    await t.rollback();
    console.error("enrollStudent error:", err);
    return res.status(500).json({ error: "Error interno del servidor." });
  }
};

const deleteEnrollment = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { user_id, id_course } = req.body;

    if (!user_id || !id_course) {
      await t.rollback();
      return res.status(400).json({ error: "Faltan user_id o id_course." });
    }

    const enrollment = await Enrollment.findOne({
      where: { user_id, id_course },
      transaction: t
    });

    if (!enrollment) {
      await t.rollback();
      return res.status(404).json({ error: "El alumno no está inscrito en ese curso." });
    }

    await enrollment.destroy({ transaction: t });
    await t.commit();

    return res.status(200).json({ message: "Inscripción eliminada correctamente." });
  } catch (err) {
    await t.rollback();
    console.error("deleteEnrollment error:", err);
    return res.status(500).json({ error: "Error interno del servidor." });
  }
};

const syncEnrollmentsWithSection = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { courseId } = req.params;
    const normalizedCourseId = Number(courseId);

    if (!Number.isFinite(normalizedCourseId) || normalizedCourseId <= 0) {
      await t.rollback();
      return res.status(400).json({ error: "El courseId no es válido." });
    }

    const course = await Course.findByPk(normalizedCourseId, {
      attributes: ["id_course", "name_subject", "id_section"],
      include: [{ model: Section, as: "section", attributes: ["id_section", "name"], required: false }],
      transaction: t
    });
    if (!course) {
      await t.rollback();
      return res.status(404).json({ error: "Curso no encontrado." });
    }

    if (!course.id_section) {
      await t.rollback();
      return res.status(400).json({ error: "El curso no tiene una sección asignada." });
    }

    const enrollments = await Enrollment.findAll({
      where: { id_course: normalizedCourseId },
      attributes: ["id_enrollment", "user_id"],
      include: [{
        model: User,
        as: "student",
        attributes: ["id", "email"],
        include: [
          { model: DtInfo, as: "profile", attributes: ["name", "lastname"] },
          { model: InfoStudent, as: "studentInfo", attributes: ["student_code", "id_section"], required: false }
        ]
      }],
      transaction: t
    });

    const removed = [];
    const protectedRows = [];

    for (const enrollment of enrollments) {
      const student = enrollment.student;
      const studentInfo = student?.studentInfo;
      const studentSectionId = studentInfo?.id_section ?? null;

      if (Number(studentSectionId) === Number(course.id_section)) {
        continue;
      }

      const detail = {
        user_id: enrollment.user_id,
        student_code: studentInfo?.student_code || null,
        name: `${student?.profile?.name || ""} ${student?.profile?.lastname || ""}`.trim() || student?.email || "—",
        email: student?.email || null,
        current_section_id: studentSectionId,
        current_section_name: null
      };

      const hasAttendance = await Attendance.findOne({
        where: { user_id: enrollment.user_id, id_course: normalizedCourseId },
        attributes: ["id_attendance"],
        transaction: t
      });

      if (hasAttendance) {
        protectedRows.push({
          ...detail,
          reason: "Tiene asistencias registradas en este curso."
        });
        continue;
      }

      await enrollment.destroy({ transaction: t });
      removed.push(detail);
    }

    await t.commit();

    return res.status(200).json({
      message: "Sincronización de inscritos completada.",
      course: {
        id_course: course.id_course,
        name_subject: course.name_subject,
        id_section: course.id_section,
        section_name: course.section?.name || null
      },
      removed_count: removed.length,
      protected_count: protectedRows.length,
      kept_count: enrollments.length - removed.length,
      removed,
      protected: protectedRows
    });
  } catch (err) {
    await t.rollback();
    console.error("syncEnrollmentsWithSection error:", err);
    return res.status(500).json({ error: "Error interno del servidor." });
  }
};

const getStudentEnrollments = async (req, res) => {
  try {
    const { userId } = req.params;

    const student = await User.findByPk(userId, { attributes: ["id", "level"] });
    if (!student || student.level !== ROLE_STUDENT) {
      return res.status(404).json({ error: "Alumno no encontrado." });
    }

    const enrollments = await Enrollment.findAll({
      where: { user_id: userId },
      attributes: ["id_enrollment", "created_at"],
      include: [{
        model: Course,
        as: "course",
        attributes: ["id_course", "name_subject"],
        include: [
          {
            model: CourseSchedule,
            as: "schedules",
            attributes: ["id_schedule", "day_of_week", "start_time", "end_time"],
            required: false
          }
        ]
      }],
      order: [["created_at", "DESC"]]
    });

    return res.status(200).json(enrollments);
  } catch (err) {
    console.error("getStudentEnrollments error:", err);
    return res.status(500).json({ error: "Error interno del servidor." });
  }
};

const getEnrollmentsByCourse = async (req, res) => {
  try {
    const { courseId } = req.params;

    const course = await Course.findByPk(courseId, {
      attributes: ["id_course", "name_subject"]
    });
    if (!course) return res.status(404).json({ error: "Curso no encontrado." });

    const enrollments = await Enrollment.findAll({
      where: { id_course: Number(courseId) },
      attributes: ["id_enrollment", "user_id"],
      include: [{
        model: User,
        as: "student",
        attributes: ["id", "email"],
        include: [
          { model: DtInfo,      as: "profile",     attributes: ["name", "lastname"] },
          { model: InfoStudent, as: "studentInfo",  attributes: ["student_code"] }
        ]
      }],
      order: [["id_enrollment", "ASC"]]
    });

    return res.status(200).json(enrollments);
  } catch (err) {
    console.error("getEnrollmentsByCourse error:", err);
    return res.status(500).json({ error: "Error interno del servidor." });
  }
};

module.exports = { enrollSection, enrollStudent, deleteEnrollment, getStudentEnrollments, getEnrollmentsByCourse, syncEnrollmentsWithSection };
