const { Subject } = require("../../models");

const listSubjects = async (req, res) => {
    try {
        const subjects = await Subject.findAll({
            attributes: ["id_subject", "name_subject"],
            order: [["name_subject", "ASC"]]
        });

        return res.status(200).json(subjects);
    } catch (err) {
        console.error("listSubjects error:", err);
        return res.status(500).json({ error: "Error interno del servidor." });
    }
};

const createSubject = async (req, res) => {
    try {
        const name_subject = String(req.body?.name_subject || "").trim();

        if (!name_subject) {
            return res.status(400).json({ error: "El nombre de la materia es obligatorio." });
        }

        const existing = await Subject.findOne({ where: { name_subject } });
        if (existing) {
            return res.status(409).json({ error: "La materia ya existe." });
        }

        const subject = await Subject.create({ name_subject });
        return res.status(201).json({
            message: "Materia creada correctamente.",
            subject
        });
    } catch (err) {
        console.error("createSubject error:", err);
        return res.status(500).json({ error: "Error interno del servidor." });
    }
};

module.exports = { listSubjects, createSubject };
