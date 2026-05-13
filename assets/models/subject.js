module.exports = (sequelize, DataTypes) => {
  const Subject = sequelize.define("Subject", {
    id_subject: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    name_subject: {
      type: DataTypes.STRING(80),
      allowNull: false
    }
  }, {
    tableName: "Subject",
    timestamps: false
  });

  return Subject;
};
