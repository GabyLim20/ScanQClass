module.exports = (sequelize, DataTypes) => {
  const Course = sequelize.define("Course", {
    id_course: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    id_subject: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    id_section: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    name_subject: {
      type: DataTypes.STRING(80),
      allowNull: false
    }
  }, {
    tableName: "Course",
    timestamps: false
  });

  return Course;
};
