const { Grade, SGroup, Turn, Sex, Section } = require("../../models");

const getCatalogs = async (req, res) => {
    try {
        const [grades, groups, turns, sexes] = await Promise.all([
            Grade.findAll({ order: [["name_grade", "ASC"]] }),
            SGroup.findAll({ order: [["name_group", "ASC"]] }),
            Turn.findAll({ order: [["name_turn", "ASC"]] }),
            Sex.findAll({ order: [["name_sex", "ASC"]] })
        ]);

        return res.status(200).json({ grades, groups, turns, sexes });
    } catch (err) {
        console.error("getCatalogs error:", err);
        return res.status(500).json({ error: "Error interno del servidor." });
    }
};

const listSections = async (req, res) => {
    try {
        const sections = await Section.findAll({
            include: [
                { model: Grade, as: "grade", attributes: ["id_grade", "name_grade"] },
                { model: SGroup, as: "group", attributes: ["id_group", "name_group"] },
                { model: Turn, as: "turn", attributes: ["id_turn", "name_turn"] }
            ],
            order: [["name", "ASC"]]
        });

        return res.status(200).json(sections);
    } catch (err) {
        console.error("listSections error:", err);
        return res.status(500).json({ error: "Error interno del servidor." });
    }
};

module.exports = { getCatalogs, listSections };
