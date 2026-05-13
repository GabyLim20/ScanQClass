module.exports = (sequelize, DataTypes) => {
  const InfoStudent = sequelize.define("InfoStudent", {
    id_student: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      unique: true
    },
    student_code: {
      type: DataTypes.STRING(30),
      allowNull: true,
      unique: true
    },
    id_section: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    average: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: true
    },
    status: {
      type: DataTypes.ENUM("regular", "irregular"),
      defaultValue: "regular"
    },
    id_sex: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    }
  }, {
    tableName: "Info_Student",
    timestamps: false
  });

  InfoStudent.associate = (models) => {
    InfoStudent.belongsTo(models.User,    { foreignKey: "user_id",    as: "user"    });
    InfoStudent.belongsTo(models.Section, { foreignKey: "id_section", as: "section" });
    InfoStudent.belongsTo(models.Sex,     { foreignKey: "id_sex",     as: "sex"     });
  };

  return InfoStudent;
};
