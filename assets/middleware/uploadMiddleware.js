const multer = require("multer");
const path = require("path");

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const mime = file.mimetype;

    const allowedExt = [".xlsx", ".xls"];
    const allowedMime = [
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.ms-excel"
    ];

    if (allowedExt.includes(ext) || allowedMime.includes(mime)) {
        return cb(null, true);
    }

    cb(new Error("Solo se permiten archivos Excel (.xlsx, .xls)"));
};

const uploadMiddleware = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024
    }
}).single("file");

module.exports = uploadMiddleware;