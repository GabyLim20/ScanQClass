module.exports = (sequelize, DataTypes) => {
  const PdfFiles = sequelize.define("PdfFiles", {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    id_course: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    filename: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    mime_type: {
      type: DataTypes.STRING(50),
      allowNull: false
    },
    file_data: {
      type: DataTypes.BLOB("long"),
      allowNull: false
    },
    uploaded_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    }
  }, {
    tableName: "PdfFiles",
    timestamps: false
  });

  return PdfFiles;
};