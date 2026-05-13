module.exports = (sequelize, DataTypes) => {
    const CourseSchedule = sequelize.define("CourseSchedule", {
        id_schedule: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        id_course: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        day_of_week: {
            type: DataTypes.ENUM("Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado"),
            allowNull: false
        },
        start_time: {
            type: DataTypes.TIME,
            allowNull: false
        },
        end_time: {
            type: DataTypes.TIME,
            allowNull: false
        }
    }, {
        tableName: "Course_Schedule",
        timestamps: false
    });

    return CourseSchedule;
};
