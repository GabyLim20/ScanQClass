const bcrypt = require("bcryptjs");
const { Op } = require("sequelize");
const {
  sequelize,
  User,
  DtInfo,
  InfoTeacher,
  Course,
  Attendance
} = require("../../models");

const ROLE_TEACHER = 2;
const normalizeEmail = (email = "") => String(email).trim().toLowerCase();

const getAllTeachers = async (req, res) => {
  try {
    const teachers = await User.findAll({
      where: { level: ROLE_TEACHER },
      attributes: ["id", "email"],
      include: [
        {
          model: DtInfo,
          as: "profile",
          attributes: ["name", "lastname", "phone", "birthdate"]
        },
        {
          model: InfoTeacher,
          as: "teacherCourses",
          attributes: ["id_teacher", "id_course"],
          include: [
            {
              model: Course,
              as: "course",
              attributes: ["id_course", "name_subject"]
            }
          ]
        }
      ],
      order: [[{ model: DtInfo, as: "profile" }, "lastname", "ASC"]]
    });

    return res.status(200).json(teachers);
  } catch (err) {
    console.error("getAllTeachers error:", err);
    return res.status(500).json({ error: "Error interno del servidor." });
  }
};

const createTeacher = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { name, lastname, email, phone, birthdate, courses = [] } = req.body;

    if (!name || !lastname || !email) {
      await t.rollback();
      return res.status(400).json({ error: "Faltan campos obligatorios." });
    }

    const cleanEmail = normalizeEmail(email);
    if (!cleanEmail.endsWith("@academicos.udg.mx")) {
      await t.rollback();
      return res.status(400).json({ error: "El correo debe terminar en @academicos.udg.mx" });
    }

    const existing = await User.findOne({ where: { email: cleanEmail }, transaction: t });
    if (existing) {
      await t.rollback();
      return res.status(409).json({ error: "El correo ya está registrado." });
    }

    const courseIds = Array.isArray(courses) ? courses.map(Number).filter(Boolean) : [];
    if (courseIds.length > 0) {
      const found = await Course.findAll({
        where: { id_course: { [Op.in]: courseIds } },
        transaction: t
      });
      if (found.length !== courseIds.length) {
        await t.rollback();
        return res.status(404).json({ error: "Uno o más cursos no existen." });
      }
    }

    const passwordPlano = "Maestro2025B";
    const hashed = await bcrypt.hash(passwordPlano, 10);

    const user = await User.create(
      { email: cleanEmail, password: hashed, level: ROLE_TEACHER,must_change_password: true},
      { transaction: t }
    );

    await DtInfo.create(
      { name, lastname, birthdate: birthdate || null, phone: phone || null, user_id: user.id },
      { transaction: t }
    );

    let infoTeacherRows = [];
    if (courseIds.length > 0) {
      infoTeacherRows = await InfoTeacher.bulkCreate(
        courseIds.map(id_course => ({ user_id: user.id, id_course })),
        { transaction: t }
      );
    }

    await t.commit();

    return res.status(201).json({
      message: "Maestro creado correctamente.",
      maestro: {
        id:         user.id,
        nombre:     `${name} ${lastname}`.trim(),
        email:      user.email,
        contraseña: passwordPlano,
        cursos:     infoTeacherRows
      }
    });
  } catch (err) {
    await t.rollback();
    console.error("createTeacher error:", err);
    return res.status(500).json({ error: "Error interno del servidor." });
  }
};

const updateTeacher = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { id } = req.params;
    const { name, lastname, email, phone, birthdate, courses } = req.body;

    const user = await User.findByPk(id, { transaction: t });
    if (!user || user.level !== ROLE_TEACHER) {
      await t.rollback();
      return res.status(404).json({ error: "Maestro no encontrado." });
    }

    if (email) {
      const cleanEmail = normalizeEmail(email);
      if (!cleanEmail.endsWith("@academicos.udg.mx")) {
        await t.rollback();
        return res.status(400).json({ error: "El correo debe terminar en @academicos.udg.mx" });
      }
      const dup = await User.findOne({
        where: { email: cleanEmail, id: { [Op.ne]: id } },
        transaction: t
      });
      if (dup) {
        await t.rollback();
        return res.status(409).json({ error: "El correo ya está registrado." });
      }
      await user.update({ email: cleanEmail }, { transaction: t });
    }

    const dtInfo = await DtInfo.findOne({ where: { user_id: id }, transaction: t });
    if (dtInfo) {
      await dtInfo.update(
        {
          name:      name      ?? dtInfo.name,
          lastname:  lastname  ?? dtInfo.lastname,
          phone:     phone     ?? dtInfo.phone,
          birthdate: birthdate ?? dtInfo.birthdate
        },
        { transaction: t }
      );
    }

    if (Array.isArray(courses)) {
      const courseIds = courses.map(Number).filter(Boolean);

      if (courseIds.length > 0) {
        const found = await Course.findAll({
          where: { id_course: { [Op.in]: courseIds } },
          transaction: t
        });
        if (found.length !== courseIds.length) {
          await t.rollback();
          return res.status(404).json({ error: "Uno o más cursos no existen." });
        }
      }

      await InfoTeacher.destroy({ where: { user_id: id }, transaction: t });

      if (courseIds.length > 0) {
        await InfoTeacher.bulkCreate(
          courseIds.map(id_course => ({ user_id: Number(id), id_course })),
          { transaction: t }
        );
      }
    }

    await t.commit();
    return res.status(200).json({ message: "Maestro actualizado correctamente." });
  } catch (err) {
    await t.rollback();
    console.error("updateTeacher error:", err);
    return res.status(500).json({ error: "Error interno del servidor." });
  }
};

const deleteTeacher = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { id } = req.params;

    const user = await User.findByPk(id, { transaction: t });
    if (!user || user.level !== ROLE_TEACHER) {
      await t.rollback();
      return res.status(404).json({ error: "Maestro no encontrado." });
    }

    await Attendance.destroy({ where: { id_teacher: id }, transaction: t });
    await InfoTeacher.destroy({ where: { user_id: id }, transaction: t });
    await DtInfo.destroy({ where: { user_id: id }, transaction: t });
    await user.destroy({ transaction: t });

    await t.commit();
    return res.status(200).json({ message: "Maestro eliminado correctamente." });
  } catch (err) {
    await t.rollback();
    console.error("deleteTeacher error:", err);
    return res.status(500).json({ error: "Error interno del servidor." });
  }
};

module.exports = { getAllTeachers, createTeacher, updateTeacher, deleteTeacher };
