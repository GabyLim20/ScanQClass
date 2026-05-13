module.exports = (sequelize, DataTypes) => {
  const Attendance = sequelize.define("Attendance", {
    id_attendance: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    id_teacher: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    id_course: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    date: {
      type: DataTypes.DATE,
      allowNull: false
    },
    status: {
      type: DataTypes.ENUM("present", "absent", "late", "justified"),
      defaultValue: "present"
    },
    justified_by: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    justified_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    justification_text: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    justification_image: {
      type: DataTypes.STRING,
      allowNull: true
    },
    justification_status: {
      type: DataTypes.STRING,
      allowNull: true
    },
    justification_ai_result: {
      type: DataTypes.STRING,
      allowNull: true
    },
    justification_ai_score: {
      type: DataTypes.FLOAT,
      allowNull: true
    },
    justification_ai_comment: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    id_session: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: null
    }
  }, {
    tableName: "Attendance",
    timestamps: false
  });

  return Attendance;
};
