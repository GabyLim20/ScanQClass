module.exports = (sequilize, DataTypes) => {
    const Grade = sequilize.define("Grade", {
        id_grade: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        name_grade: {
            type: DataTypes.STRING(20),
            allowNull: false,
            unique: true
        }
    }, {
        tableName: "Grade",
        timestamps: false
    });

    return Grade;
};