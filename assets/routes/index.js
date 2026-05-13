const express = require("express");
const router = express.Router();
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const { verifyToken, verifyAdmin, verifyTeacher, verifyLogin, verifyAuthenticated, requireSuperAdmin } = require("../middleware/auth.middleware");

const {
    loginUser,
    registerUser,
    forgotPassword,
    resetPassword,
    changePassword
} = require("../controllers/authController");

const { generateStudentQr } = require("../controllers/qrController");
const {
    getMyAttendance,
    submitJustificationRequest,
    downloadJustificationImage,
    getMyNotifications,
    markNotificationAsRead
} = require("../controllers/studentController");

const {
    getAllStudents,
    createStudent,
    updateStudent,
    deleteStudent,
    getStudentAttendanceHistory,
    getAllTeachers,
    createTeacher,
    updateTeacher,
    deleteTeacher,
    getClassesTable,
    createClass,
    updateClass,
    deleteClass,
    listSubjects,
    createSubject,
    getDashboardStats,
    getAttendanceRiskStatistics,
    getCatalogs,
    listSections,
    uploadStudentExcel,
    enrollSection,
    enrollStudent,
    deleteEnrollment,
    getStudentEnrollments,
    getEnrollmentsByCourse,
    syncEnrollmentsWithSection
} = require("../controllers/admin/adminController");

const {
    getTeacherDashboard,
    takeAttendanceByQr,
    closeAttendanceSession,
    getSessionToday,
    getMyClasses,
    uploadCoursePdf,
    listClassPdfs,
    downloadClassPdf,
    deleteClassPdf,
    getClassHistory,
    justifyAttendance,
    getPendingJustifications,
    approveJustificationRequest,
    rejectJustificationRequest
} = require("../controllers/teacherController");

// Multer PDFs 
const uploadPdf = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (String(file.mimetype || "").toLowerCase() !== "application/pdf") {
            return cb(new Error("Solo se permiten archivos PDF"));
        }
        cb(null, true);
    }
}).single("file");

const JUSTIFICATION_UPLOADS_DIR = path.resolve(__dirname, "..", "..", "uploads", "justifications");
fs.mkdirSync(JUSTIFICATION_UPLOADS_DIR, { recursive: true });

const justificationImageUpload = multer({
    storage: multer.diskStorage({
        destination: (_req, _file, cb) => cb(null, JUSTIFICATION_UPLOADS_DIR),
        filename: (_req, file, cb) => {
            const ext = path.extname(String(file.originalname || "")).toLowerCase();
            cb(null, `${Date.now()}-${crypto.randomBytes(10).toString("hex")}${ext}`);
        }
    }),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        const ext = path.extname(String(file.originalname || "")).toLowerCase();
        const allowedExtensions = new Set([".jpg", ".jpeg", ".png", ".webp"]);
        const allowedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
        if (!allowedExtensions.has(ext) || !allowedMimeTypes.has(String(file.mimetype || "").toLowerCase())) {
            return cb(new Error("Solo se permiten imagenes JPG, JPEG, PNG o WEBP."));
        }
        cb(null, true);
    }
});

function uploadJustificationImage(req, res, next) {
    justificationImageUpload.single("justification_image")(req, res, err => {
        if (!err) return next();
        if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
            return res.status(413).json({ error: "La imagen no puede exceder 5MB." });
        }
        return res.status(400).json({ error: err.message || "No se pudo procesar la imagen de justificacion." });
    });
}

// Multer Excel
const uploadExcel = require("../middleware/uploadMiddleware");

//  AUTH  
router.post("/login", loginUser);
router.post("/register", registerUser);
router.post("/auth/forgot", forgotPassword);
router.post("/auth/reset", resetPassword);
router.post("/auth/change-password", verifyAuthenticated, changePassword);
router.post("/auth/changePassword", verifyAuthenticated, changePassword);

//  QR 
router.get("/qr/student/:id", verifyLogin, generateStudentQr);

//  ALUMNO 
router.get("/student/attendance", verifyLogin, getMyAttendance);
router.post("/student/attendance/justify-request", verifyLogin, uploadJustificationImage, submitJustificationRequest);
router.get("/student/notifications", verifyLogin, getMyNotifications);
router.put("/student/notifications/:id/read", verifyLogin, markNotificationAsRead);
router.get("/attendance/justifications/:id/image", verifyToken, downloadJustificationImage);

//  ADMIN
router.get("/admin/dashboard", verifyAdmin, getDashboardStats);
router.get("/admin/statistics/attendance-risk", verifyAdmin, getAttendanceRiskStatistics);

// Alumnos
router.post("/admin/createStudent", verifyAdmin, requireSuperAdmin, createStudent);
router.get("/admin/getStudent", verifyAdmin, getAllStudents);
router.get("/admin/students/:studentId/attendance-history", verifyAdmin, getStudentAttendanceHistory);
router.put("/admin/updateStudent/:id", verifyAdmin, requireSuperAdmin, updateStudent);
router.delete("/admin/deleteStudent/:id", verifyAdmin, requireSuperAdmin, deleteStudent);

// Maestros
router.post("/admin/createTeacher", verifyAdmin, requireSuperAdmin, createTeacher);
router.get("/admin/getTeacher", verifyAdmin, requireSuperAdmin, getAllTeachers);
router.put("/admin/updateTeacher/:id", verifyAdmin, requireSuperAdmin, updateTeacher);
router.delete("/admin/deleteTeacher/:id", verifyAdmin, requireSuperAdmin, deleteTeacher);

// Clases / Cursos
router.post("/admin/createClass", verifyAdmin, requireSuperAdmin, createClass);
router.get("/admin/getClasses", verifyAdmin, requireSuperAdmin, getClassesTable);
router.put("/admin/updateClass/:id", verifyAdmin, requireSuperAdmin, updateClass);
router.delete("/admin/deleteClass/:id", verifyAdmin, requireSuperAdmin, deleteClass);
router.get("/admin/subjects", verifyAdmin, requireSuperAdmin, listSubjects);
router.post("/admin/subjects", verifyAdmin, requireSuperAdmin, createSubject);

// Catálogos y secciones
router.get("/admin/catalogs", verifyAdmin, requireSuperAdmin, getCatalogs);
router.get("/admin/sections", verifyAdmin, requireSuperAdmin, listSections);

// Carga masiva de alumnos via Excel
router.post("/admin/upload", verifyAdmin, requireSuperAdmin, uploadExcel, uploadStudentExcel);

// Inscripciones
router.post("/admin/enrollSection", verifyAdmin, requireSuperAdmin, enrollSection);
router.post("/admin/enrollStudent", verifyAdmin, requireSuperAdmin, enrollStudent);
router.delete("/admin/deleteEnrollment", verifyAdmin, requireSuperAdmin, deleteEnrollment);
router.get("/admin/enrollments/course/:courseId", verifyAdmin, requireSuperAdmin, getEnrollmentsByCourse);
router.post("/admin/enrollments/sync-section/:courseId", verifyAdmin, requireSuperAdmin, syncEnrollmentsWithSection);
router.get("/admin/enrollments/:userId", verifyAdmin, requireSuperAdmin, getStudentEnrollments);

//  MAESTRO  
router.get("/teacher/classes", verifyTeacher, getMyClasses);
router.get("/teacher/dashboard", verifyTeacher, getTeacherDashboard);
router.post("/teacher/attendance/scan", verifyTeacher, takeAttendanceByQr);
router.post("/teacher/classes/:id/pdf", verifyTeacher, uploadPdf, uploadCoursePdf);
router.get("/teacher/classes/:id/pdfs", verifyTeacher, listClassPdfs);
router.get("/teacher/classes/:id/pdf/:pdfId", verifyTeacher, downloadClassPdf);
router.delete("/teacher/classes/:id/pdf/:pdfId", verifyTeacher, deleteClassPdf);
router.get("/teacher/classes/:id/history", verifyTeacher, getClassHistory);
router.put("/teacher/attendance/justify", verifyTeacher, justifyAttendance);
router.get("/teacher/justifications/pending", verifyTeacher, getPendingJustifications);
router.put("/teacher/justifications/:id/approve", verifyTeacher, approveJustificationRequest);
router.put("/teacher/justifications/:id/reject", verifyTeacher, rejectJustificationRequest);

// AttendanceSessions

router.get("/teacher/attendance-sessions/today", verifyTeacher, getSessionToday);
router.post("/teacher/attendance-sessions/:id_session/close", verifyTeacher, closeAttendanceSession);

module.exports = router;
