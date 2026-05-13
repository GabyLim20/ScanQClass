"use strict";

const fs = require("fs");
const path = require("path");

function normalizeText(text = "") {
    return String(text)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();
}

function countMatches(text, keywords) {
    return keywords.reduce((total, keyword) => (
        text.includes(keyword) ? total + 1 : total
    ), 0);
}

function getTextQualityScore(normalizedText) {
    const text = String(normalizedText || "").trim();
    if (!text) return { delta: -0.18, bucket: "empty" };
    if (text.length < 12) return { delta: -0.12, bucket: "very-short" };
    if (text.length < 24) return { delta: -0.06, bucket: "short" };
    if (text.length < 60) return { delta: 0.02, bucket: "medium" };
    return { delta: 0.06, bucket: "detailed" };
}

function analyzeJustification(text) {
    const normalized = normalizeText(text);

    const categories = [
        {
            key: "salud",
            recommendation: "justificable",
            confidenceBase: 0.64,
            keywords: [
                "doctor",
                "medico",
                "medica",
                "hospital",
                "clinica",
                "consulta",
                "cita",
                "urgencia",
                "urgencias",
                "enfermedad",
                "enfermo",
                "enferma",
                "dolor",
                "fiebre",
                "vomito",
                "nausea",
                "estomago",
                "cabeza",
                "garganta",
                "receta",
                "medicamento",
                "incapacidad"
                , "laboratorio",
                "analisis",
                "dental",
                "psicologo",
                "terapia"
            ]
        },
        {
            key: "familiar",
            recommendation: "justificable",
            confidenceBase: 0.61,
            keywords: [
                "familia",
                "familiar",
                "mama",
                "papa",
                "padre",
                "madre",
                "hermano",
                "hermana",
                "abuelo",
                "abuela",
                "emergencia familiar",
                "funeral",
                "fallecimiento",
                "cuidar",
                "acompanar"
            ]
        },
        {
            key: "transporte",
            recommendation: "revisar",
            confidenceBase: 0.58,
            keywords: [
                "camion",
                "autobus",
                "transporte",
                "trafico",
                "retraso",
                "accidente",
                "ruta",
                "taxi",
                "uber",
                "ponchadura",
                "carro",
                "coche",
                "lluvia",
                "inundacion"
            ]
        },
        {
            key: "escolar/administrativo",
            recommendation: "revisar",
            confidenceBase: 0.57,
            keywords: [
                "tramite",
                "documento",
                "beca",
                "cita escolar",
                "examen",
                "orientacion",
                "direccion",
                "prefectura",
                "permiso"
            ]
        },
        {
            key: "personal",
            recommendation: "revisar",
            confidenceBase: 0.55,
            keywords: [
                "personal",
                "asunto personal",
                "problema personal",
                "emergencia personal"
            ]
        }
    ];

    const ranked = categories
        .map(category => ({
            ...category,
            matches: countMatches(normalized, category.keywords)
        }))
        .sort((a, b) => {
            if (b.matches !== a.matches) return b.matches - a.matches;
            return b.confidenceBase - a.confidenceBase;
        });

    const winner = ranked[0];
    const textQuality = getTextQualityScore(normalized);

    if (!winner || winner.matches === 0) {
        return {
            ai_category: "otro",
            ai_recommendation: "revisar",
            ai_confidence: Math.max(0.32, Number((0.42 + textQuality.delta).toFixed(2)))
        };
    }

    return {
        ai_category: winner.key,
        ai_recommendation: winner.recommendation,
        ai_confidence: Math.min(0.75, Math.max(0.38, Number((winner.confidenceBase + Math.min(winner.matches, 4) * 0.04 + textQuality.delta).toFixed(2))))
    };
}

function getFailedJustificationAnalysis() {
    return {
        result: "error",
        category: "error",
        score: 0,
        confidence: 0,
        comment: "No se pudo analizar automáticamente. Revisión manual requerida.",
        recommendation: "revisar",
        image_evidence: null
    };
}

function detectImageFormat(headerBuffer, imagePath) {
    const header = Buffer.isBuffer(headerBuffer) ? headerBuffer : Buffer.alloc(0);
    const ext = path.extname(String(imagePath || "")).toLowerCase();

    if (header.length >= 3 && header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) {
        return "jpeg";
    }
    if (
        header.length >= 8 &&
        header[0] === 0x89 &&
        header[1] === 0x50 &&
        header[2] === 0x4e &&
        header[3] === 0x47
    ) {
        return "png";
    }
    if (
        header.length >= 12 &&
        header.toString("ascii", 0, 4) === "RIFF" &&
        header.toString("ascii", 8, 12) === "WEBP"
    ) {
        return "webp";
    }
    if (ext === ".jpg" || ext === ".jpeg") return "jpeg";
    if (ext === ".png") return "png";
    if (ext === ".webp") return "webp";
    return null;
}

async function inspectJustificationImage(imagePath) {
    if (!imagePath) return null;

    const stat = await fs.promises.stat(imagePath);
    if (!stat.isFile()) {
        throw new Error("El archivo de evidencia no es válido.");
    }

    const fileHandle = await fs.promises.open(imagePath, "r");
    try {
        const header = Buffer.alloc(16);
        await fileHandle.read(header, 0, header.length, 0);
        const format = detectImageFormat(header, imagePath);
        if (!format) {
            throw new Error("No se pudo identificar el formato de la imagen.");
        }

        return {
            format,
            size_bytes: stat.size
        };
    } finally {
        await fileHandle.close();
    }
}

function getImageEvidenceHeuristics(imageEvidence) {
    if (!imageEvidence) {
        return {
            documentLikelihood: "none",
            scoreDelta: 0,
            comment: "Sin evidencia adjunta."
        };
    }

    const sizeKb = imageEvidence.size_bytes / 1024;
    if (sizeKb < 8) {
        return {
            documentLikelihood: "low",
            scoreDelta: -0.18,
            comment: "La imagen es muy pequeña para considerarla una evidencia documental sólida."
        };
    }

    if (sizeKb < 30) {
        return {
            documentLikelihood: "medium",
            scoreDelta: -0.06,
            comment: "La imagen parece válida, pero su tamaño limita la confianza sobre su utilidad documental."
        };
    }

    return {
        documentLikelihood: "medium-high",
        scoreDelta: 0.04,
        comment: `Se adjuntó una imagen válida en formato ${String(imageEvidence.format).toUpperCase()}.`
    };
}

async function analyzeJustificationEvidence({
    text,
    imagePath,
    studentName,
    studentCode,
    absenceDate
} = {}) {
    const normalizedText = normalizeText(text);
    const textAnalysis = analyzeJustification(text);
    const imageEvidence = imagePath ? await inspectJustificationImage(imagePath) : null;
    const imageHeuristics = getImageEvidenceHeuristics(imageEvidence);
    const textQuality = getTextQualityScore(normalizedText);
    let scoreBase = textAnalysis.ai_confidence + imageHeuristics.scoreDelta;

    if (imageEvidence && textQuality.bucket === "detailed") scoreBase += 0.05;
    else if (imageEvidence && textQuality.bucket === "medium") scoreBase += 0.03;
    else if (!imageEvidence && textQuality.bucket === "very-short") scoreBase -= 0.05;

    if (textAnalysis.ai_category === "otro") {
        scoreBase -= imageEvidence ? 0.04 : 0.08;
    }

    let score = Number(scoreBase.toFixed(2));
    if (!imageEvidence) {
        score = Math.min(score, 0.75);
    }
    if (!imageEvidence && textQuality.bucket === "very-short") {
        score = Math.min(score, 0.6);
    }
    score = Math.max(0.2, Math.min(0.9, score));
    const normalizedStudentName = String(studentName || "").trim();
    const normalizedStudentCode = String(studentCode || "").trim();
    const normalizedAbsenceDate = String(absenceDate || "").trim();
    const identityTargets = [
        normalizedStudentName ? `nombre "${normalizedStudentName}"` : null,
        normalizedStudentCode ? `código "${normalizedStudentCode}"` : null,
        normalizedAbsenceDate ? `fecha "${normalizedAbsenceDate}"` : null
    ].filter(Boolean).join(", ");
    const verificationScope = identityTargets
        ? `No se pudo verificar automáticamente si la evidencia contiene ${identityTargets}.`
        : "La evidencia requiere revisión manual para confirmar sus datos.";
    const coherenceNote = imageEvidence
        ? `El motivo se clasificó como ${textAnalysis.ai_category} y la imagen requiere revisión visual para confirmar que sea coherente con la ausencia.`
        : `El análisis se basa solo en el motivo y se clasificó como ${textAnalysis.ai_category}.`;

    return {
        result: textAnalysis.ai_category,
        category: textAnalysis.ai_category,
        score,
        confidence: score,
        comment: `${imageHeuristics.comment} ${verificationScope} ${coherenceNote} Revisión manual recomendada.`,
        recommendation: textAnalysis.ai_recommendation,
        image_evidence: imageEvidence,
        multimodal_capable: false
    };
}

function serializeJustificationRequest(payload) {
    return JSON.stringify({
        format: "scanq-justification-v1",
        ...payload
    });
}

function parseJustificationRequest(value) {
    if (!value) return null;

    try {
        const parsed = JSON.parse(String(value));
        if (parsed && parsed.format === "scanq-justification-v1") {
            return parsed;
        }
    } catch (_) {
    }

    return {
        format: "legacy-text",
        original_text: String(value),
        review_status: "legacy"
    };
}

function normalizeJustificationStatus(value) {
    const normalized = String(value || "").trim().toUpperCase();
    if (normalized === "PENDING") return "pending";
    if (normalized === "APPROVED") return "accepted";
    if (normalized === "REJECTED") return "rejected";
    return null;
}

function getJustificationReviewStatus(row) {
    const columnStatus = normalizeJustificationStatus(row?.justification_status);
    if (columnStatus) return columnStatus;
    return parseJustificationRequest(row?.justification_text)?.review_status || null;
}

function getJustificationOriginalText(row) {
    const request = parseJustificationRequest(row?.justification_text);
    return request?.original_text || row?.justification_text || null;
}

function getJustificationAiResult(row) {
    return row?.justification_ai_result || parseJustificationRequest(row?.justification_text)?.ai_category || null;
}

function getJustificationAiScore(row) {
    if (row?.justification_ai_score != null) return Number(row.justification_ai_score);
    const fallback = parseJustificationRequest(row?.justification_text)?.ai_confidence;
    return fallback != null ? Number(fallback) : null;
}

function getJustificationAiComment(row) {
    if (row?.justification_ai_comment) return row.justification_ai_comment;
    const request = parseJustificationRequest(row?.justification_text);
    if (request?.ai_recommendation) {
        return `Recomendación IA: ${request.ai_recommendation}.`;
    }
    return null;
}

module.exports = {
    analyzeJustification,
    analyzeJustificationEvidence,
    getFailedJustificationAnalysis,
    serializeJustificationRequest,
    parseJustificationRequest,
    normalizeJustificationStatus,
    getJustificationReviewStatus,
    getJustificationOriginalText,
    getJustificationAiResult,
    getJustificationAiScore,
    getJustificationAiComment
};
