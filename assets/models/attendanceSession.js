module.exports = (sequelize, DataTypes) => {
    const AttendanceSession = sequelize.define("AttendanceSession", {
        id_session: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        id_course: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        id_teacher: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        id_schedule: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        date: {
            type: DataTypes.DATEONLY,
            allowNull: false
        },
        status: {
            type: DataTypes.ENUM("OPEN", "CLOSED"),
            allowNull: false,
            defaultValue: "OPEN"
        },
        opened_at: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW
        },
        closed_at: {
            type: DataTypes.DATE,
            allowNull: true,
            defaultValue: null
        },
        closed_by: {
            type: DataTypes.INTEGER,
            allowNull: true,
            defaultValue: null
        }
    }, {
        tableName: "Attendance_Session",
        timestamps: true
    });

    return AttendanceSession;
};
