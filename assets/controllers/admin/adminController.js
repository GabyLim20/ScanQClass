const { getAllStudents, createStudent, updateStudent, deleteStudent, getStudentAttendanceHistory } = require("./studentController");
const { getAllTeachers, createTeacher, updateTeacher, deleteTeacher } = require("./teacherController");
const { getClassesTable, createClass, updateClass, deleteClass }     = require("./classController");
const { listSubjects, createSubject }                                = require("./subjectController");
const { getDashboardStats }                                           = require("./dashboardController");
const { getAttendanceRiskStatistics }                                 = require("./statisticsController");
const { getCatalogs, listSections }                                   = require("./catalogController");
const { uploadStudentExcel }                                          = require("../uploadController");
const { enrollSection, enrollStudent, deleteEnrollment, getStudentEnrollments, getEnrollmentsByCourse, syncEnrollmentsWithSection } = require("./enrollmentController");

module.exports = {
  // Alumnos
  getAllStudents,
  createStudent,
  updateStudent,
  deleteStudent,
  getStudentAttendanceHistory,

  // Maestros
  getAllTeachers,
  createTeacher,
  updateTeacher,
  deleteTeacher,

  // Clases / Cursos
  getClassesTable,
  createClass,
  updateClass,
  deleteClass,

  // Materias
  listSubjects,
  createSubject,

  // Dashboard
  getDashboardStats,
  getAttendanceRiskStatistics,

  // Catálogos y secciones
  getCatalogs,
  listSections,

  // Carga masiva
  uploadStudentExcel,

  // Inscripciones
  enrollSection,
  enrollStudent,
  deleteEnrollment,
  getStudentEnrollments,
  getEnrollmentsByCourse,
  syncEnrollmentsWithSection
};
