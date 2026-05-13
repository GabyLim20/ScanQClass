module.exports = (sequelize, DataTypes) => {
    const DtInfo = sequelize.define("DtInfo", {
        id_info: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        name: {
            type: DataTypes.STRING(80),
            allowNull: false
        },
        lastname: {
            type: DataTypes.STRING(80),
            allowNull: false
        },
        birthdate: {
            type: DataTypes.DATE,
            allowNull: true
        },
        phone: {
            type: DataTypes.STRING(15),
            allowNull: true
        },
        user_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            unique: true
        }
    }, {
        tableName: "Dt_info",
        timestamps: false
    });

    DtInfo.associate = (models) => {
        DtInfo.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
    };

    return DtInfo;
};