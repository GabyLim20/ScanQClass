const { Op } = require("sequelize");
const {
  sequelize,
  Course,
  Subject,
  Section,
  CourseSchedule,
  InfoTeacher,
  Enrollment,
  InfoStudent,
  Attendance,
  User,
  DtInfo
} = require("../../models");

const VALID_DAYS = ["Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado"];
const ROLE_TEACHER = 2;

function schedulesOverlap(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

function normalizeSchedules(schedules) {
  if (schedules === undefined) return { provided: false, value: [] };
  if (!Array.isArray(schedules)) return { error: "El campo schedules debe ser un arreglo." };

  const normalized = schedules.map((item, index) => {
    const day_of_week = item?.day_of_week ? String(item.day_of_week).trim() : "";
    const start_time  = item?.start_time ? String(item.start_time).trim() : "";
    const end_time    = item?.end_time ? String(item.end_time).trim() : "";

    if (!day_of_week || !start_time || !end_time) {
      return { error: `El horario en la posición ${index} está incompleto.` };
    }

    if (!VALID_DAYS.includes(day_of_week)) {
      return { error: `El día '${day_of_week}' no es válido.` };
    }

    if (start_time >= end_time) {
      return { error: `La hora de inicio debe ser menor que la hora de fin en la posición ${index}.` };
    }

    return { day_of_week, start_time, end_time };
  });

  const invalid = normalized.find(item => item.error);
  if (invalid) return invalid;

  for (let i = 0; i < normalized.length; i += 1) {
    for (let j = i + 1; j < normalized.length; j += 1) {
      const current = normalized[i];
      const next = normalized[j];

      if (current.day_of_week !== next.day_of_week) continue;

      if (current.start_time === next.start_time && current.end_time === next.end_time) {
        return {
          error: `Hay horarios duplicados el ${current.day_of_week} (${current.start_time} - ${current.end_time}).`
        };
      }

      if (schedulesOverlap(current.start_time, current.end_time, next.start_time, next.end_time)) {
        return {
          error: `Hay horarios traslapados el ${current.day_of_week} entre ${current.start_time}-${current.end_time} y ${next.start_time}-${next.end_time}.`
        };
      }
    }
  }

  return { provided: true, value: normalized };
}

async function validateSectionScheduleConflicts(id_section, schedules, transaction, excludeCourseId = null) {
  if (!id_section || !Array.isArray(schedules) || schedules.length === 0) return null;

  const where = { id_section: Number(id_section) };
  const normalizedExcludeCourseId =
    excludeCourseId !== null && excludeCourseId !== undefined && excludeCourseId !== ""
      ? Number(excludeCourseId)
      : null;
  if (normalizedExcludeCourseId !== null) {
    where.id_course = { [Op.ne]: normalizedExcludeCourseId };
  }

  const courses = await Course.findAll({
    where,
    attributes: ["id_course", "name_subject"],
    include: [
      {
        model: CourseSchedule,
        as: "schedules",
        attributes: ["day_of_week", "start_time", "end_time"],
        required: true
      }
    ],
    transaction
  });

  for (const incoming of schedules) {
    for (const course of courses) {
      if (normalizedExcludeCourseId !== null && Number(course.id_course) === normalizedExcludeCourseId) {
        continue;
      }

      for (const existing of course.schedules || []) {
        if (incoming.day_of_week !== existing.day_of_week) continue;

        if (
          schedulesOverlap(
            incoming.start_time,
            incoming.end_time,
            existing.start_time,
            existing.end_time
          )
        ) {
          return `La sección ya tiene un horario traslapado el ${incoming.day_of_week} entre ${incoming.start_time}-${incoming.end_time} y ${existing.start_time}-${existing.end_time} en el curso ${course.name_subject || course.id_course}.`;
        }
      }
    }
  }

  return null;
}

function normalizeTeacherIdFromBody(body = {}) {
  const rawTeacherId = body.teacher_id ?? body.user_id_teacher;

  if (rawTeacherId === undefined) return undefined;
  if (rawTeacherId === null || rawTeacherId === "") return null;

  return Number(rawTeacherId);
}

async function validateTeacherScheduleConflicts(userId, schedules, transaction, excludeCourseId = null) {
  if (!userId || !Array.isArray(schedules) || schedules.length === 0) return null;

  const where = { user_id: Number(userId) };
  if (excludeCourseId) where.id_course = { [Op.ne]: Number(excludeCourseId) };

  const assignments = await InfoTeacher.findAll({
    where,
    attributes: ["id_course"],
    include: [
      {
        model: Course,
        as: "course",
        attributes: ["id_course", "name_subject"],
        include: [
          {
            model: Section,
            as: "section",
            attributes: ["name"],
            required: false
          },
          {
            model: CourseSchedule,
            as: "schedules",
            attributes: ["day_of_week", "start_time", "end_time"],
            required: true
          }
        ]
      }
    ],
    transaction
  });

  for (const incoming of schedules) {
    for (const assignment of assignments) {
      const existingCourse = assignment.course;
      if (!existingCourse) continue;

      for (const existing of existingCourse.schedules || []) {
        if (incoming.day_of_week !== existing.day_of_week) continue;

        if (
          schedulesOverlap(
            incoming.start_time,
            incoming.end_time,
            existing.start_time,
            existing.end_time
          )
        ) {
          const sectionLabel = existingCourse.section?.name ? ` — ${existingCourse.section.name}` : "";
          if (
            incoming.start_time === existing.start_time &&
            incoming.end_time === existing.end_time
          ) {
            return `El maestro ya tiene ese horario el ${incoming.day_of_week} a las ${incoming.start_time}-${incoming.end_time} en el curso ${existingCourse.name_subject || existingCourse.id_course}${sectionLabel}.`;
          }

          return `El maestro ya tiene clase el ${incoming.day_of_week} de ${existing.start_time} a ${existing.end_time} en el curso ${existingCourse.name_subject || existingCourse.id_course}${sectionLabel}.`;
        }
      }
    }
  }

  return null;
}

async function autoEnrollSectionStudents(id_section, id_course, transaction) {
  if (!id_section || !id_course) {
    return {
      total_students: 0,
      created_count: 0,
      skipped_count: 0,
      invalid_count: 0,
      errors: []
    };
  }

  const sectionStudents = await InfoStudent.findAll({
    where: { id_section: Number(id_section) },
    attributes: ["user_id", "student_code"],
    transaction
  });

  const totalStudents = sectionStudents.length;
  const errors = [];
  const validRows = [];

  for (const row of sectionStudents) {
    const user_id = Number(row.user_id);
    const student_code = row.student_code || null;

    if (!user_id) {
      errors.push({
        student_code,
        user_id: row.user_id ?? null,
        reason: "InfoStudent sin user_id válido."
      });
      continue;
    }

    if (!student_code) {
      errors.push({
        student_code: null,
        user_id,
        reason: "Alumno sin student_code."
      });
      continue;
    }

    validRows.push({ user_id, student_code });
  }

  const validCandidateUserIds = [...new Set(validRows.map(row => row.user_id))];
  if (validCandidateUserIds.length === 0) {
    return {
      total_students: totalStudents,
      created_count: 0,
      skipped_count: 0,
      invalid_count: errors.length,
      errors
    };
  }

  const validUsers = await User.findAll({
    where: { id: { [Op.in]: validCandidateUserIds }, level: 3 },
    attributes: ["id"],
    transaction
  });

  const validUserIds = new Set(validUsers.map(row => Number(row.id)));
  const enrollableRows = [];
  for (const row of validRows) {
    if (!validUserIds.has(row.user_id)) {
      errors.push({
        student_code: row.student_code,
        user_id: row.user_id,
        reason: "user_id no existe en Users o no corresponde a un alumno."
      });
      continue;
    }
    enrollableRows.push(row);
  }

  const enrollableUserIds = [...new Set(enrollableRows.map(row => row.user_id))];
  if (enrollableUserIds.length === 0) {
    return {
      total_students: totalStudents,
      created_count: 0,
      skipped_count: 0,
      invalid_count: errors.length,
      errors
    };
  }

  const existingEnrollments = await Enrollment.findAll({
    where: {
      id_course: Number(id_course),
      user_id: { [Op.in]: enrollableUserIds }
    },
    attributes: ["user_id"],
    transaction
  });

  const existingUserIds = new Set(existingEnrollments.map(row => Number(row.user_id)));
  const studentCodeByUserId = new Map(enrollableRows.map(row => [Number(row.user_id), row.student_code]));
  const enrollmentsToCreate = enrollableUserIds
    .filter(user_id => !existingUserIds.has(user_id));

  let createdCount = 0;
  for (const user_id of enrollmentsToCreate) {
    try {
      await Enrollment.create({ user_id, id_course: Number(id_course) }, { transaction });
      createdCount += 1;
    } catch (err) {
      console.error("autoEnroll error:", err);
      errors.push({
        student_code: studentCodeByUserId.get(Number(user_id)) || null,
        user_id,
        reason: err?.name === "SequelizeForeignKeyConstraintError"
          ? "No se pudo crear la inscripción por una referencia inválida."
          : err?.name === "SequelizeUniqueConstraintError"
            ? "El alumno ya estaba inscrito en esta clase."
            : "No se pudo crear la inscripción automáticamente."
      });
    }
  }

  return {
    total_students: totalStudents,
    created_count: createdCount,
    skipped_count: existingUserIds.size,
    invalid_count: errors.length,
    errors
  };
}

function serializeCourse(course) {
  if (!course) return null;
  return {
    id_course: course.id_course,
    id_subject: course.id_subject,
    id_section: course.id_section,
    name_subject: course.name_subject
  };
}

const getClassesTable = async (req, res) => {
  try {
    const courses = await Course.findAll({
      attributes: ["id_course", "id_subject", "id_section", "name_subject"],
      include: [
        {
          model: Subject,
          as: "subject",
          attributes: ["id_subject", "name_subject"],
          required: false
        },
        {
          model: Section,
          as: "section",
          attributes: ["id_section", "name"],
          required: false
        },
        {
          model: CourseSchedule,
          as: "schedules",
          attributes: ["id_schedule", "id_course", "day_of_week", "start_time", "end_time"],
          required: false
        },
        {
          model: InfoTeacher,
          as: "teachers",
          attributes: ["id_teacher", "user_id"],
          include: [
            {
              model: User,
              as: "teacher",
              attributes: ["id", "email"],
              include: [{ model: DtInfo, as: "profile", attributes: ["name", "lastname"] }]
            }
          ]
        }
      ],
      order: [["name_subject", "ASC"]]
    });

    return res.status(200).json(courses);
  } catch (err) {
    console.error("getClassesTable error:", err);
    return res.status(500).json({ error: "Error interno del servidor." });
  }
};

const createClass = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { id_subject, id_section, name_subject, schedules } = req.body;
    const normalizedSubjectId =
      id_subject !== undefined && id_subject !== null && id_subject !== ""
        ? Number(id_subject)
        : null;
    const normalizedSectionId =
      id_section !== undefined && id_section !== null && id_section !== ""
        ? Number(id_section)
        : null;
    const normalizedTeacherId = normalizeTeacherIdFromBody(req.body);
    let resolvedName = name_subject ? String(name_subject).trim() : "";
    const normalizedSchedules = normalizeSchedules(schedules);

    if (!resolvedName && !normalizedSubjectId) {
      await t.rollback();
      return res.status(400).json({ error: "Debes enviar name_subject o id_subject." });
    }

    if (normalizedSchedules.error) {
      await t.rollback();
      return res.status(400).json({ error: normalizedSchedules.error });
    }

    if (normalizedSubjectId) {
      const subject = await Subject.findByPk(normalizedSubjectId, { transaction: t });
      if (!subject) {
        await t.rollback();
        return res.status(404).json({ error: "La materia no existe." });
      }
      if (!resolvedName) resolvedName = subject.name_subject;
    }

    if (normalizedSectionId) {
      const section = await Section.findByPk(normalizedSectionId, { transaction: t });
      if (!section) {
        await t.rollback();
        return res.status(404).json({ error: "La sección no existe." });
      }
    }

    if (normalizedSectionId && normalizedSchedules.provided && normalizedSchedules.value.length > 0) {
      const sectionConflict = await validateSectionScheduleConflicts(
        normalizedSectionId,
        normalizedSchedules.value,
        t
      );
      if (sectionConflict) {
        await t.rollback();
        return res.status(409).json({ error: sectionConflict });
      }
    }

    if (normalizedTeacherId !== undefined && normalizedTeacherId !== null) {
      const teacherUser = await User.findByPk(normalizedTeacherId, { transaction: t });
      if (!teacherUser || teacherUser.level !== ROLE_TEACHER) {
        await t.rollback();
        return res.status(404).json({ error: "El maestro no existe o no es válido." });
      }
    }

    if (normalizedTeacherId && normalizedSchedules.provided && normalizedSchedules.value.length > 0) {
      const teacherConflict = await validateTeacherScheduleConflicts(
        normalizedTeacherId,
        normalizedSchedules.value,
        t
      );
      if (teacherConflict) {
        await t.rollback();
        return res.status(409).json({ error: teacherConflict });
      }
    }

    const course = await Course.create({
      id_subject:   normalizedSubjectId,
      id_section:   normalizedSectionId,
      name_subject: resolvedName
    }, { transaction: t });

    let createdSchedules = [];
    if (normalizedSchedules.provided && normalizedSchedules.value.length > 0) {
      createdSchedules = await CourseSchedule.bulkCreate(
        normalizedSchedules.value.map(item => ({
          id_course: course.id_course,
          day_of_week: item.day_of_week,
          start_time: item.start_time,
          end_time: item.end_time
        })),
        { transaction: t }
      );
    }

    const autoEnrollResult = normalizedSectionId
      ? await autoEnrollSectionStudents(normalizedSectionId, course.id_course, t)
      : {
          total_students: 0,
          created_count: 0,
          skipped_count: 0,
          invalid_count: 0,
          errors: []
        };

    if (normalizedTeacherId) {
      await InfoTeacher.create({
        user_id: normalizedTeacherId,
        id_course: course.id_course
      }, { transaction: t });
    }

    await t.commit();

    return res.status(201).json({
      message: autoEnrollResult.invalid_count > 0
        ? `Curso creado correctamente. Se inscribieron ${autoEnrollResult.created_count} alumnos. ${autoEnrollResult.invalid_count} alumnos fueron omitidos por datos inválidos.`
        : "Curso creado correctamente.",
      course: serializeCourse(course),
      schedules: createdSchedules,
      auto_enrolled_count: autoEnrollResult.created_count,
      auto_enroll_summary: autoEnrollResult
    });
  } catch (err) {
    await t.rollback();
    console.error("createClass error:", err);
    return res.status(500).json({ error: "Error interno del servidor." });
  }
};

const updateClass = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    console.error("updateClass params:", req.params);
    console.error("updateClass body:", req.body);

    const { id } = req.params;
    const { id_subject, id_section, name_subject, schedules } = req.body;
    const normalizedSchedules = normalizeSchedules(schedules);
    const normalizedTeacherId = normalizeTeacherIdFromBody(req.body);
    const targetSectionId =
      id_section !== undefined && id_section !== null && id_section !== ""
        ? Number(id_section)
        : null;

    if (normalizedSchedules.error) {
      await t.rollback();
      return res.status(400).json({ error: normalizedSchedules.error });
    }

    const course = await Course.findByPk(id, { transaction: t });
    if (!course) {
      await t.rollback();
      return res.status(404).json({ error: "Curso no encontrado." });
    }

    const currentTeacherAssignment = await InfoTeacher.findOne({
      where: { id_course: course.id_course },
      attributes: ["id_teacher", "user_id"],
      transaction: t
    });
    const currentSchedules = await CourseSchedule.findAll({
      where: { id_course: course.id_course },
      attributes: ["day_of_week", "start_time", "end_time"],
      transaction: t
    });

    if (id_subject !== undefined && id_subject !== null && id_subject !== "") {
      const subject = await Subject.findByPk(id_subject, { transaction: t });
      if (!subject) {
        await t.rollback();
        return res.status(404).json({ error: "La materia no existe." });
      }
    }

    if (id_section !== undefined && id_section !== null && id_section !== "") {
      const section = await Section.findByPk(id_section, { transaction: t });
      if (!section) {
        await t.rollback();
        return res.status(404).json({ error: "La sección no existe." });
      }
    }

    if (normalizedTeacherId !== undefined && normalizedTeacherId !== null) {
      const teacherUser = await User.findByPk(normalizedTeacherId, { transaction: t });
      if (!teacherUser || teacherUser.level !== ROLE_TEACHER) {
        await t.rollback();
        return res.status(404).json({ error: "El maestro no existe o no es válido." });
      }
    }

    const effectiveSectionId = targetSectionId || course.id_section;
    const shouldValidateSectionConflicts =
      normalizedSchedules.provided ||
      (targetSectionId !== null && Number(targetSectionId) !== Number(course.id_section));

    if (effectiveSectionId && shouldValidateSectionConflicts && normalizedSchedules.provided && normalizedSchedules.value.length > 0) {
      const sectionConflict = await validateSectionScheduleConflicts(
        effectiveSectionId,
        normalizedSchedules.value,
        t,
        course.id_course
      );
      if (sectionConflict) {
        await t.rollback();
        return res.status(409).json({ error: sectionConflict });
      }
    }

    const effectiveTeacherId = normalizedTeacherId !== undefined
      ? normalizedTeacherId
      : (currentTeacherAssignment?.user_id || null);
    const effectiveSchedules = normalizedSchedules.provided
      ? normalizedSchedules.value
      : currentSchedules.map(item => ({
          day_of_week: item.day_of_week,
          start_time: item.start_time,
          end_time: item.end_time
        }));

    if (effectiveTeacherId && effectiveSchedules.length > 0 && (normalizedTeacherId !== undefined || normalizedSchedules.provided)) {
      const teacherConflict = await validateTeacherScheduleConflicts(
        effectiveTeacherId,
        effectiveSchedules,
        t,
        course.id_course
      );
      if (teacherConflict) {
        await t.rollback();
        return res.status(409).json({ error: teacherConflict });
      }
    }

    const previousSectionId = course.id_section;

    await course.update({
      id_subject:   id_subject   !== undefined ? (id_subject || null) : course.id_subject,
      id_section:   id_section   !== undefined ? (id_section || null) : course.id_section,
      name_subject: name_subject ? name_subject.trim() : course.name_subject
    }, { transaction: t });

    let updatedSchedules = [];
    if (normalizedSchedules.provided) {
      await CourseSchedule.destroy({ where: { id_course: course.id_course }, transaction: t });

      if (normalizedSchedules.value.length > 0) {
        updatedSchedules = await CourseSchedule.bulkCreate(
          normalizedSchedules.value.map(item => ({
            id_course: course.id_course,
            day_of_week: item.day_of_week,
            start_time: item.start_time,
            end_time: item.end_time
          })),
          { transaction: t }
        );
      }
    }

    let autoEnrollResult = {
      total_students: 0,
      created_count: 0,
      skipped_count: 0,
      invalid_count: 0,
      errors: []
    };
    if (targetSectionId !== null && Number(targetSectionId) !== Number(previousSectionId)) {
      autoEnrollResult = await autoEnrollSectionStudents(targetSectionId, course.id_course, t);
    }

    if (normalizedTeacherId !== undefined) {
      const nextTeacherId = normalizedTeacherId ? Number(normalizedTeacherId) : null;
      const currentAssignedUserId = currentTeacherAssignment?.user_id ? Number(currentTeacherAssignment.user_id) : null;

      if (currentTeacherAssignment) {
        const hasAttendance = await Attendance.findOne({
          where: { id_teacher: currentTeacherAssignment.id_teacher },
          attributes: ["id_attendance"],
          transaction: t
        });

        if (nextTeacherId === currentAssignedUserId) {
        } else if (hasAttendance) {
          await t.rollback();
          return res.status(409).json({
            error: "No se puede cambiar el maestro de esta clase porque ya existen asistencias registradas con la asignación actual."
          });
        } else if (nextTeacherId) {
          await currentTeacherAssignment.update({ user_id: nextTeacherId }, { transaction: t });
        } else {
          await currentTeacherAssignment.destroy({ transaction: t });
        }
      } else if (nextTeacherId) {
        await InfoTeacher.create({
          user_id: nextTeacherId,
          id_course: course.id_course
        }, { transaction: t });
      }
    }

    await t.commit();

    return res.status(200).json({
      message: autoEnrollResult.invalid_count > 0
        ? `Curso actualizado correctamente. Se inscribieron ${autoEnrollResult.created_count} alumnos. ${autoEnrollResult.invalid_count} alumnos fueron omitidos por datos inválidos.`
        : "Curso actualizado correctamente.",
      course: serializeCourse(course),
      schedules: normalizedSchedules.provided ? updatedSchedules : undefined,
      auto_enrolled_count: autoEnrollResult.created_count,
      auto_enroll_summary: autoEnrollResult
    });
  } catch (err) {
    if (!t.finished) {
      await t.rollback();
    }
    console.error("updateClass error:", err);
    console.error("updateClass error full:", err);
    if (err?.name === "SequelizeUniqueConstraintError") {
      return res.status(409).json({ error: "Uno o más alumnos de la sección ya estaban inscritos en esta clase." });
    }
    return res.status(500).json({ error: "Error interno del servidor." });
  }
};

const deleteClass = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { id } = req.params;

    const course = await Course.findByPk(id, { transaction: t });
    if (!course) {
      await t.rollback();
      return res.status(404).json({ error: "Curso no encontrado." });
    }

    await Attendance.destroy({ where: { id_course: id }, transaction: t });
    await Enrollment.destroy({ where: { id_course: id }, transaction: t });
    await InfoTeacher.destroy({ where: { id_course: id }, transaction: t });

    await course.destroy({ transaction: t });
    await t.commit();

    return res.status(200).json({ message: "Curso eliminado correctamente." });
  } catch (err) {
    await t.rollback();
    console.error("deleteClass error:", err);
    return res.status(500).json({ error: "Error interno del servidor." });
  }
};

module.exports = { getClassesTable, createClass, updateClass, deleteClass };
