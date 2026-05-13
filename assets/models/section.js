module.exports = (sequelize, DataTypes) => {
  const Section = sequelize.define("Section", {
    id_section: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    id_grade: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    id_group: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    id_turn: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    name: {
      type: DataTypes.STRING(20),
      allowNull: true,
      unique: true
    }
  }, {
    tableName: "Section",
    timestamps: false
  });

  return Section;
};