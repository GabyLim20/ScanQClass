module.exports = (sequelize, DataTypes) => {
  const Enrollment = sequelize.define("Enrollment", {
    id_enrollment: {
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
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    }
  }, {
    tableName: "Enrollment",
    timestamps: false,
    indexes: [
      { name: "idx_enroll_user", fields: ["user_id"] },
      { name: "idx_enroll_course", fields: ["id_course"] },
      { name: "uniq_enrollment", unique: true, fields: ["user_id", "id_course"] }
    ]
  });

  return Enrollment;
};