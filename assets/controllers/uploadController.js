const { importStudentsFromExcel } = require("../services/admin/studentImportService");

const uploadStudentExcel = async (req, res) => {
  try {
    const file = req.file;
    const id_section = req.body?.id_section || null;

    if (!file) {
      return res.status(400).json({ error: "No se proporcionó un archivo Excel." });
    }

    const result = await importStudentsFromExcel({
      buffer: file.buffer,
      sectionId: id_section
    });

    return res.status(200).json({
      message: "Archivo procesado correctamente.",
      ...result
    });
  } catch (error) {
    console.error("Error al subir el Excel:", error);
    return res.status(error.status || 500).json({
      error: error.message || "Error al procesar el archivo."
    });
  }
};

module.exports = { uploadStudentExcel };
