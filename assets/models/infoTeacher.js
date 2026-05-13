module.exports = (sequelize, DataTypes) => {
  const Info_Teacher = sequelize.define("Info_Teacher", {
    id_teacher: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    id_course: {
      type: DataTypes.INTEGER,
      allowNull: false
    }
  }, {
    tableName: "Info_Teacher",
    timestamps: false
  });

  return Info_Teacher;
};