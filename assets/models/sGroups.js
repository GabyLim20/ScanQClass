module.exports = (sequelize, DataTypes) => {
  const SGroups = sequelize.define("SGroups", {
    id_group: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    name_group: {
      type: DataTypes.STRING(2),
      allowNull: false,
      unique: true
    }
  }, {
    tableName: "SGroups",
    timestamps: false
  });

  return SGroups;
};