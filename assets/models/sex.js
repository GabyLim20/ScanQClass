module.exports = (sequelize, DataTypes) => {
  const Sex = sequelize.define("Sex", {
    id_sex: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    name_sex: {
      type: DataTypes.STRING(10),
      allowNull: false,
      unique: true
    },
    name_abbreviation: {
      type: DataTypes.STRING(5),
      allowNull: false,
      unique: true
    }
  }, {
    tableName: "Sex",
    timestamps: false
  });

  return Sex;
};