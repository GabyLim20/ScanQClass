module.exports = (sequelize, DataTypes) => {
  const Turn = sequelize.define("Turn", {
    id_turn: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    name_turn: {
      type: DataTypes.STRING(20),
      allowNull: false,
      unique: true
    }
  }, {
    tableName: "Turn",
    timestamps: false
  });

  return Turn;
};