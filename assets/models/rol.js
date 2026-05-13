module.exports = (sequelize, DataTypes) => {
  const Rol = sequelize.define("Rol", {
    id_rol: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true
    },
    name_rol: {
      type: DataTypes.STRING(20),
      allowNull: false,
      unique: true
    }
  }, {
    tableName: "Rols",
    timestamps: false
  });

  Rol.associate = (models) => {
    Rol.hasMany(models.User, { foreignKey: 'level' }); 
};


  return Rol;
};
