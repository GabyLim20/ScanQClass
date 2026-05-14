const bcrypt = require("bcryptjs");
const { Op } = require("sequelize");
const {
    sequelize,
    User,
    DtInfo,
    InfoStudent,
    Section,
    Grade,
    SGroup,
    Turn,
    Sex,
    Attendance,
    Enrollment,
    Course,
    Subject,
    InfoTeacher
} = require("../../models");
const { getJustificationReviewStatus } = require("../../utils/justificationAI");

const ROLE_STUDENT = 3;
const normalizeEmail = (email = "") => String(email).trim().toLowerCase();

function getCurrentMonthValue(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function getMonthRange(month) {
    const raw = month ? String(month).trim() : getCurrentMonthValue();

    if (!/^\d{4}-\d{2}$/.test(raw)) {
        return { error: "El periodo debe tener formato YYYY-MM." };
    }

    const [year, monthNumber] = raw.split("-").map(Number);
    if (monthNumber < 1 || monthNumber > 12) {
        return { error: "El mes debe estar entre 01 y 12." };
    }

    return {
        month: raw,
        start: new Date(year, monthNumber - 1, 1, 0, 0, 0, 0),
        end: new Date(year, monthNumber, 0, 23, 59, 59, 999)
    };
}

function getAttendanceStatus(row) {
    if (row?.status === "absent" && getJustificationReviewStatus(row) === "accepted") {
        return "justified";
    }
    return row?.status;
}

function isAttendanceCredit(status) {
    return status === "present" || status === "late" || status === "justified";
}

function getEmptyAttendanceCounts() {
    return {
        attendances: 0,
        lates: 0,
        absences: 0,
        justified: 0,
        totalClasses: 0,
        attendanceCredits: 0
    };
}

function countAttendance(rows = []) {
    const counts = getEmptyAttendanceCounts();
    counts.totalClasses = rows.length;

    rows.forEach(row => {
        const status = getAttendanceStatus(row);
        if (isAttendanceCredit(status)) counts.attendanceCredits += 1;
        if (status === "present") counts.attendances += 1;
        else if (status === "late") counts.lates += 1;
        else if (status === "absent") counts.absences += 1;
        else if (status === "justified") counts.justified += 1;
    });

    return counts;
}

function calculateAttendancePercentage(counts) {
    if (!counts.totalClasses) return 0;
    return Number(((counts.attendanceCredits / counts.totalClasses) * 100).toFixed(1));
}

function calculateRisk(counts) {
    if (!counts.totalClasses) return "Sin datos";

    const attendancePercentage = calculateAttendancePercentage(counts);
    const latePercentage = (counts.lates / counts.totalClasses) * 100;

    if (attendancePercentage < 70 || counts.absences >= 3) return "Alto";
    if (attendancePercentage < 85 || latePercentage >= 10) return "Medio";
    return "Bajo";
}

function getTeacherName(teacherUser) {
    const fullName = `${teacherUser?.profile?.name || ""} ${teacherUser?.profile?.lastname || ""}`.trim();
    return fullName || teacherUser?.email || "";
}

function getStudentName(student) {
    const profile = student?.profile || {};
    return `${profile.name || ""} ${profile.lastname || ""}`.trim() || student?.email || `Alumno ${student?.id || ""}`;
}

const getAllStudents = async (req, res) => {
    try {
        const students = await User.findAll({
            where: { level: ROLE_STUDENT },
            attributes: ["id", "email"],
            include: [
                {
                    model: DtInfo,
                    as: "profile",
                    attributes: ["name", "lastname", "phone", "birthdate"]
                },
                {
                    model: InfoStudent,
                    as: "studentInfo",
                    attributes: ["id_student", "student_code", "id_section", "average", "status", "id_sex", "created_at"],
                    include: [
                        {
                            model: Section,
                            as: "section",
                            attributes: ["id_section", "name"],
                            include: [
                                { model: Grade, as: "grade", attributes: ["id_grade", "name_grade"] },
                                { model: SGroup, as: "group", attributes: ["id_group", "name_group"] },
                                { model: Turn, as: "turn", attributes: ["id_turn", "name_turn"] }
                            ]
                        },
                        { model: Sex, as: "sex", attributes: ["id_sex", "name_sex", "name_abbreviation"] }
                    ]
                }
            ],
            order: [[{ model: DtInfo, as: "profile" }, "lastname", "ASC"]]
        });

        return res.status(200).json(students);
    } catch (err) {
        console.error("getAllStudents error:", err);
        return res.status(500).json({ error: "Error interno del servidor." });
    }
};

const getStudentAttendanceHistory = async (req, res) => {
    try {
        const studentId = Number(req.params.studentId);
        if (!Number.isFinite(studentId) || studentId <= 0) {
            return res.status(400).json({ error: "El id del alumno no es válido." });
        }

        const range = getMonthRange(req.query.month);
        if (range.error) {
            return res.status(400).json({ error: range.error });
        }

        const student = await User.findOne({
            where: { id: studentId, level: ROLE_STUDENT },
            attributes: ["id", "email"],
            include: [
                {
                    model: DtInfo,
                    as: "profile",
                    attributes: ["name", "lastname"]
                },
                {
                    model: InfoStudent,
                    as: "studentInfo",
                    attributes: ["student_code", "status", "id_section"],
                    include: [
                        {
                            model: Section,
                            as: "section",
                            attributes: ["id_section", "name"]
                        }
                    ]
                }
            ]
        });

        if (!student) {
            return res.status(404).json({ error: "Alumno no encontrado." });
        }

        const enrollments = await Enrollment.findAll({
            where: { user_id: studentId },
            attributes: ["id_course"],
            include: [
                {
                    model: Course,
                    as: "course",
                    attributes: ["id_course", "id_subject", "id_section", "name_subject"],
                    required: true,
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
                            model: InfoTeacher,
                            as: "teachers",
                            attributes: ["id_teacher", "user_id"],
                            required: false,
                            include: [
                                {
                                    model: User,
                                    as: "teacher",
                                    attributes: ["id", "email"],
                                    include: [
                                        {
                                            model: DtInfo,
                                            as: "profile",
                                            attributes: ["name", "lastname"],
                                            required: false
                                        }
                                    ]
                                }
                            ]
                        }
                    ]
                }
            ],
            order: [[{ model: Course, as: "course" }, "name_subject", "ASC"]]
        });

        const courseIds = enrollments
            .map(row => Number(row.id_course))
            .filter(Boolean);

        const attendanceRows = courseIds.length
            ? await Attendance.findAll({
                where: {
                    user_id: studentId,
                    id_course: { [Op.in]: courseIds },
                    date: { [Op.between]: [range.start, range.end] }
                },
                attributes: ["id_course", "status", "date", "justification_text"],
                order: [["date", "ASC"]]
            })
            : [];

        const rowsByCourse = new Map();
        attendanceRows.forEach(row => {
            const key = Number(row.id_course);
            if (!rowsByCourse.has(key)) rowsByCourse.set(key, []);
            rowsByCourse.get(key).push(row);
        });

        const courses = enrollments.map(enrollment => {
            const course = enrollment.course || {};
            const courseId = Number(enrollment.id_course);
            const rows = rowsByCourse.get(courseId) || [];
            const counts = countAttendance(rows);
            const teacherNames = (course.teachers || [])
                .map(row => getTeacherName(row.teacher))
                .filter(Boolean);

            return {
                courseId,
                subject: course.subject?.name_subject || course.name_subject || "Curso sin nombre",
                teacher: teacherNames.length ? teacherNames.join(", ") : "Sin maestro",
                attendances: counts.attendances,
                lates: counts.lates,
                absences: counts.absences,
                justified: counts.justified,
                totalClasses: counts.totalClasses,
                attendancePercentage: calculateAttendancePercentage(counts),
                risk: calculateRisk(counts)
            };
        });

        const summaryCounts = courses.reduce((acc, course) => {
            acc.attendances += Number(course.attendances || 0);
            acc.lates += Number(course.lates || 0);
            acc.absences += Number(course.absences || 0);
            acc.justified += Number(course.justified || 0);
            acc.totalClasses += Number(course.totalClasses || 0);
            acc.attendanceCredits += Number(course.attendances || 0) + Number(course.lates || 0) + Number(course.justified || 0);
            return acc;
        }, getEmptyAttendanceCounts());

        return res.status(200).json({
            student: {
                id: student.id,
                name: getStudentName(student),
                code: student.studentInfo?.student_code || null,
                email: student.email,
                section: student.studentInfo?.section?.name || null,
                status: student.studentInfo?.status || null
            },
            period: range.month,
            summary: {
                courses: courses.length,
                attendancePercentage: calculateAttendancePercentage(summaryCounts),
                totalAttendances: summaryCounts.attendances,
                totalLates: summaryCounts.lates,
                totalAbsences: summaryCounts.absences,
                totalJustified: summaryCounts.justified,
                totalClasses: summaryCounts.totalClasses
            },
            courses
        });
    } catch (err) {
        console.error("getStudentAttendanceHistory error:", err);
        return res.status(500).json({ error: "No se pudo cargar el historial de asistencia." });
    }
};

const createStudent = async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const { name, lastname, email, phone, birthdate, student_code, average, status, sex, id_section } = req.body;

        if (!name || !lastname || !email || !id_section) {
            await t.rollback();
            return res.status(400).json({ error: "Faltan campos obligatorios." });
        }

        const cleanEmail = normalizeEmail(email);
        if (!cleanEmail.endsWith("@alumnos.udg.mx")) {
            await t.rollback();
            return res.status(400).json({ error: "El correo debe terminar en @alumnos.udg.mx" });
        }

        const existingUser = await User.findOne({ where: { email: cleanEmail }, transaction: t });
        if (existingUser) {
            await t.rollback();
            return res.status(409).json({ error: "El correo ya está registrado." });
        }

        if (student_code) {
            const existingCode = await InfoStudent.findOne({ where: { student_code }, transaction: t });
            if (existingCode) {
                await t.rollback();
                return res.status(409).json({ error: "El código de estudiante ya está registrado." });
            }
        }

        const section = await Section.findByPk(id_section, { transaction: t });
        if (!section) {
            await t.rollback();
            return res.status(404).json({ error: "La sección no existe." });
        }

        const passwordPlano = "Alumno2025B";
        const hashedPassword = await bcrypt.hash(passwordPlano, 10);

        const user = await User.create(
            { email: cleanEmail, password: hashedPassword, level: ROLE_STUDENT,must_change_password: true },
            { transaction: t }
        );

        await DtInfo.create(
            { name, lastname, birthdate: birthdate || null, phone: phone || null, user_id: user.id },
            { transaction: t }
        );

        const student = await InfoStudent.create(
            {
                user_id: user.id,
                student_code: student_code || null,
                id_section: Number(id_section),
                average: average || null,
                status: status || "regular",
                id_sex: sex || null
            },
            { transaction: t }
        );

        await t.commit();

        return res.status(201).json({
            message: "Alumno creado correctamente.",
            alumno: {
                id: user.id,
                nombre: `${name} ${lastname}`.trim(),
                email: user.email,
                contraseña: passwordPlano,
                infoStudent: student
            }
        });
    } catch (err) {
        await t.rollback();
        console.error("createStudent error:", err);
        return res.status(500).json({ error: "Error interno del servidor." });
    }
};

const updateStudent = async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const { id } = req.params;
        const { name, lastname, email, phone, birthdate, student_code, average, status, sex, id_section } = req.body;

        const user = await User.findByPk(id, { transaction: t });
        if (!user || user.level !== ROLE_STUDENT) {
            await t.rollback();
            return res.status(404).json({ error: "Alumno no encontrado." });
        }

        if (email) {
            const cleanEmail = normalizeEmail(email);
            if (!cleanEmail.endsWith("@alumnos.udg.mx")) {
                await t.rollback();
                return res.status(400).json({ error: "El correo debe terminar en @alumnos.udg.mx" });
            }
            const dup = await User.findOne({ where: { email: cleanEmail, id: { [Op.ne]: id } }, transaction: t });
            if (dup) {
                await t.rollback();
                return res.status(409).json({ error: "El correo ya está registrado." });
            }
            await user.update({ email: cleanEmail }, { transaction: t });
        }

        if (id_section) {
            const section = await Section.findByPk(id_section, { transaction: t });
            if (!section) {
                await t.rollback();
                return res.status(404).json({ error: "La sección no existe." });
            }
        }

        if (student_code) {
            const dup = await InfoStudent.findOne({
                where: { student_code, user_id: { [Op.ne]: id } },
                transaction: t
            });
            if (dup) {
                await t.rollback();
                return res.status(409).json({ error: "El código de estudiante ya está registrado." });
            }
        }

        const dtInfo = await DtInfo.findOne({ where: { user_id: id }, transaction: t });
        if (dtInfo) {
            await dtInfo.update(
                {
                    name: name ?? dtInfo.name,
                    lastname: lastname ?? dtInfo.lastname,
                    phone: phone ?? dtInfo.phone,
                    birthdate: birthdate ?? dtInfo.birthdate
                },
                { transaction: t }
            );
        }

        const student = await InfoStudent.findOne({ where: { user_id: id }, transaction: t });
        if (!student) {
            await t.rollback();
            return res.status(404).json({ error: "Información del alumno no encontrada." });
        }

        await student.update(
            {
                student_code: student_code ?? student.student_code,
                id_section: id_section ?? student.id_section,
                average: average ?? student.average,
                status: status ?? student.status,
                id_sex: sex ?? student.id_sex
            },
            { transaction: t }
        );

        await t.commit();
        return res.status(200).json({ message: "Alumno actualizado correctamente." });
    } catch (err) {
        await t.rollback();
        console.error("updateStudent error:", err);
        return res.status(500).json({ error: "Error interno del servidor." });
    }
};

const deleteStudent = async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const { id } = req.params;

        const user = await User.findByPk(id, { transaction: t });
        if (!user || user.level !== ROLE_STUDENT) {
            await t.rollback();
            return res.status(404).json({ error: "Alumno no encontrado." });
        }

        await Attendance.destroy({ where: { user_id: id }, transaction: t });
        await Enrollment.destroy({ where: { user_id: id }, transaction: t });
        await InfoStudent.destroy({ where: { user_id: id }, transaction: t });
        await DtInfo.destroy({ where: { user_id: id }, transaction: t });
        await user.destroy({ transaction: t });

        await t.commit();
        return res.status(200).json({ message: "Alumno eliminado correctamente." });
    } catch (err) {
        await t.rollback();
        console.error("deleteStudent error:", err);
        return res.status(500).json({ error: "Error interno del servidor." });
    }
};

module.exports = { getAllStudents, createStudent, updateStudent, deleteStudent, getStudentAttendanceHistory };
