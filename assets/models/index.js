const { Sequelize } = require("sequelize");
const config = require("../config/config.json").development;
const sequelize = new Sequelize(config.database, config.username, config.password, {
  host: config.host,
  dialect: config.dialect,
  port: config.port || 3306,
  logging: false
});

const User = require("./user")(sequelize, Sequelize.DataTypes);
const Rol = require("./rol")(sequelize, Sequelize.DataTypes);
const Grade = require("./grade")(sequelize, Sequelize.DataTypes);
const DtInfo = require("./dtInfo")(sequelize, Sequelize.DataTypes);
const InfoStudent = require("./infoStudent")(sequelize, Sequelize.DataTypes);
const Enrollment = require("./enrollment")(sequelize, Sequelize.DataTypes);
const SGroup = require("./sGroups")(sequelize, Sequelize.DataTypes);
const Sex = require("./sex")(sequelize, Sequelize.DataTypes);
const InfoTeacher = require("./infoTeacher")(sequelize, Sequelize.DataTypes);
const Pdf = require("./pdfFiles")(sequelize, Sequelize.DataTypes);
const Section = require("./section")(sequelize, Sequelize.DataTypes);
const Attendance = require("./attendance")(sequelize, Sequelize.DataTypes);
const Turn = require("./turn")(sequelize, Sequelize.DataTypes);
const Course = require("./course")(sequelize, Sequelize.DataTypes);
const Subject = require("./subject")(sequelize, Sequelize.DataTypes);
const CourseSchedule = require("./courseSchedule")(sequelize, Sequelize.DataTypes);
const Notification = require("./notification")(sequelize, Sequelize.DataTypes);
const AttendanceSession = require("./attendanceSession")(sequelize, Sequelize.DataTypes);

const db = {
  sequelize,
  Sequelize,
  User,
  Rol,
  Grade,
  DtInfo,
  InfoStudent,
  Enrollment,
  SGroup,
  Sex,
  InfoTeacher,
  Pdf,
  Section,
  Attendance,
  Turn,
  Course,
  Subject,
  CourseSchedule,
  Notification,
  AttendanceSession
};

Object.values(db).forEach(model => {
  if (model && typeof model.associate === "function") {
    model.associate(db);
  }
});

User.hasOne(InfoStudent, { foreignKey: "user_id", as: "studentInfo" });

// User
User.hasMany(InfoTeacher, { foreignKey: "user_id", as: "teacherCourses" });
InfoTeacher.belongsTo(User, { foreignKey: "user_id", as: "teacher" });
InfoTeacher.belongsTo(Course, { foreignKey: "id_course", as: "course" });
Course.hasMany(InfoTeacher, { foreignKey: "id_course", as: "teachers" });

// Enrollment
Enrollment.belongsTo(User, { foreignKey: "user_id", as: "student" });
Enrollment.belongsTo(Course, { foreignKey: "id_course", as: "course" });
User.hasMany(Enrollment, { foreignKey: "user_id", as: "enrollments" });
Course.hasMany(Enrollment, { foreignKey: "id_course", as: "enrollments" });

// Curso
Course.belongsTo(Subject, { foreignKey: "id_subject", as: "subject" });
Course.belongsTo(Section, { foreignKey: "id_section", as: "section" });
Subject.hasMany(Course, { foreignKey: "id_subject", as: "courses" });
Section.hasMany(Course, { foreignKey: "id_section", as: "courses" });
Course.hasMany(CourseSchedule, { foreignKey: "id_course", as: "schedules" });
CourseSchedule.belongsTo(Course, { foreignKey: "id_course", as: "course" });

// Seccion
Section.belongsTo(Grade, { foreignKey: "id_grade", as: "grade" });
Section.belongsTo(SGroup, { foreignKey: "id_group", as: "group" });
Section.belongsTo(Turn, { foreignKey: "id_turn", as: "turn" });
Grade.hasMany(Section, { foreignKey: "id_grade", as: "sections" });
SGroup.hasMany(Section, { foreignKey: "id_group", as: "sections" });
Turn.hasMany(Section, { foreignKey: "id_turn", as: "sections" });

// PDF 
Pdf.belongsTo(Course, { foreignKey: "id_course", as: "course" });
Course.hasMany(Pdf, { foreignKey: "id_course", as: "pdfs" });

// Attendance
Attendance.belongsTo(User, { foreignKey: "user_id", as: "student" });
Attendance.belongsTo(Course, { foreignKey: "id_course", as: "course" });

// Notificación
User.hasMany(Notification, { foreignKey: "user_id", as: "notifications" });

// AttendanceSession
AttendanceSession.belongsTo(Course, { foreignKey: "id_course", as: "course" });
AttendanceSession.belongsTo(User, { foreignKey: "id_teacher", as: "teacher" });
AttendanceSession.belongsTo(CourseSchedule, { foreignKey: "id_schedule", as: "schedule" });
AttendanceSession.hasMany(Attendance, { foreignKey: "id_session", as: "attendances" });
Attendance.belongsTo(AttendanceSession, { foreignKey: "id_session", as: "session" });
Course.hasMany(AttendanceSession, { foreignKey: "id_course", as: "attendanceSessions" });

module.exports = db;
