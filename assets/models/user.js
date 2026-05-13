module.exports = (sequelize, DataTypes) => {
  const User = sequelize.define("User", {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    email: {
      type: DataTypes.STRING(150),
      allowNull: false,
      unique: true,
      validate: {
        isEmail: true
      }
    },
    password: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    must_change_password: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    is_super_admin: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: "is_super_admin"
    },
    level: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 3
    },
    reset_token_hash: {
      type: DataTypes.STRING(64),
      allowNull: true,
      defaultValue: null
    },
    reset_token_expires: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null
    }
  }, {
    tableName: "Users",
    timestamps: false
  });

  User.associate = (models) => {
    User.hasOne(models.DtInfo, { foreignKey: 'user_id', as: 'profile' });
    User.belongsTo(models.Rol, { foreignKey: 'level', as: 'role' });
  };


  return User;
};
