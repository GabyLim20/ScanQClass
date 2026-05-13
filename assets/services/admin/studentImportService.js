"use strict";

const XLSX = require("xlsx");
const bcrypt = require("bcryptjs");
const {
  sequelize,
  User,
  DtInfo,
  InfoStudent,
  Section,
  Sex
} = require("../../models");

const ROLE_STUDENT = 3;

function normalizeEmail(email = "") {
  return String(email).trim().toLowerCase();
}

function normalizeStudentCode(code = "") {
  return String(code).trim().replace(/\s+/g, "");
}

function normalizeColumnName(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function pick(row, aliases) {
  const normalizedAliases = new Set(aliases.map(normalizeColumnName));

  for (const [key, value] of Object.entries(row || {})) {
    if (!normalizedAliases.has(normalizeColumnName(key))) continue;
    if (value === undefined || value === null || String(value).trim() === "") continue;
    return String(value).trim();
  }

  return "";
}

function splitFullName(fullName = "") {
  const parts = String(fullName).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { name: "", lastname: "" };
  if (parts.length === 1) return { name: parts[0], lastname: "." };
  return {
    name: parts.shift(),
    lastname: parts.join(" ")
  };
}

function normalizePasswordToken(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function buildInitialStudentPassword(fullName, code) {
  const firstToken = String(fullName || "").trim().split(/\s+/).filter(Boolean)[0] || "";
  const namePart = normalizePasswordToken(firstToken);
  const codeDigits = String(code || "").replace(/\D/g, "");

  if (!namePart || codeDigits.length < 4) return null;
  return `${namePart}${codeDigits.slice(-4)}`;
}

function parseBirthdate(value) {
  if (value === undefined || value === null || value === "") return null;

  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return null;
    return new Date(parsed.y, parsed.m - 1, parsed.d);
  }

  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function resolveSexId(rawSex, sexCatalog) {
  const value = String(rawSex || "").trim().toLowerCase();
  if (!value) return null;

  const match = sexCatalog.find(item =>
    String(item.name_sex || "").trim().toLowerCase() === value ||
    String(item.name_abbreviation || "").trim().toLowerCase() === value
  );

  return match?.id_sex || null;
}

function parseStudentRow(row, sexCatalog) {
  const lastnameFromColumn = pick(row, [
    "APELLIDO",
    "APELLIDOS",
    "APELLIDO PATERNO",
    "PRIMER APELLIDO",
    "lastname",
    "last_name"
  ]);
  const firstNameFromColumn = pick(row, [
    "NOMBRE",
    "NOMBRES",
    "NOMBRE(S)",
    "PRIMER NOMBRE",
    "name",
    "first_name"
  ]);
  const fullNameFromColumn = pick(row, [
    "NOMBRE COMPLETO",
    "NOMBRE DEL ALUMNO",
    "ALUMNO",
    "ESTUDIANTE",
    "NOMBRE",
    "name"
  ]);

  const fullName = lastnameFromColumn
    ? `${lastnameFromColumn} ${firstNameFromColumn || fullNameFromColumn}`.trim()
    : fullNameFromColumn || firstNameFromColumn;

  const parsedName = lastnameFromColumn
    ? { name: firstNameFromColumn || fullNameFromColumn || ".", lastname: lastnameFromColumn }
    : splitFullName(fullName);

  const studentCode = normalizeStudentCode(pick(row, [
    "CODIGO",
    "CÓDIGO",
    "CODIGO INSTITUCIONAL",
    "CÓDIGO INSTITUCIONAL",
    "student_code",
    "code"
  ]));
  const explicitEmail = normalizeEmail(pick(row, [
    "EMAIL",
    "CORREO",
    "CORREO INSTITUCIONAL",
    "email",
    "correo"
  ]));
  const email = explicitEmail || (studentCode ? normalizeEmail(`${studentCode}@alumnos.udg.mx`) : "");

  return {
    fullName,
    passwordNameSource: lastnameFromColumn || fullName,
    name: parsedName.name,
    lastname: parsedName.lastname,
    student_code: studentCode,
    email,
    birthdate: parseBirthdate(
      row["FECHA NAC"] ??
      row["FECHA NACIMIENTO"] ??
      row["fecha nac"] ??
      row.birthdate
    ),
    phone: pick(row, [
      "TELEFONO PERSONAL",
      "TELÉFONO PERSONAL",
      "telefono personal",
      "TELEFONO",
      "TELÉFONO",
      "phone",
      "TELEFONO TUTOR",
      "TELÉFONO TUTOR",
      "telefono tutor"
    ]),
    id_sex: resolveSexId(pick(row, ["SEXO", "sexo", "sex"]), sexCatalog)
  };
}

function rowError({ sheetName, excelRow, rowData = {}, message }) {
  return {
    sheet: sheetName,
    row: excelRow,
    email: rowData.email || undefined,
    student_code: rowData.student_code || undefined,
    error: message
  };
}

async function findExistingStudent(rowData, transaction) {
  if (rowData.student_code) {
    const infoByCode = await InfoStudent.findOne({
      where: { student_code: rowData.student_code },
      include: [
        {
          model: User,
          as: "user",
          attributes: ["id", "email", "level"],
          include: [{ model: DtInfo, as: "profile", required: false }]
        }
      ],
      transaction
    });

    if (infoByCode) {
      if (!infoByCode.user) {
        return { error: "El codigo existe en Info_Student, pero no tiene usuario asociado." };
      }

      if (rowData.email) {
        const emailUser = await User.findOne({
          where: { email: rowData.email },
          attributes: ["id"],
          transaction
        });

        if (emailUser && Number(emailUser.id) !== Number(infoByCode.user_id)) {
          return { error: "El codigo y el correo pertenecen a alumnos distintos." };
        }
      }

      return {
        user: infoByCode.user,
        studentInfo: infoByCode,
        matchedBy: "code"
      };
    }
  }

  if (!rowData.email) return { user: null, studentInfo: null, matchedBy: null };

  const userByEmail = await User.findOne({
    where: { email: rowData.email },
    attributes: ["id", "email", "level"],
    include: [
      { model: DtInfo, as: "profile", required: false },
      { model: InfoStudent, as: "studentInfo", required: false }
    ],
    transaction
  });

  if (!userByEmail) return { user: null, studentInfo: null, matchedBy: null };

  const existingCode = normalizeStudentCode(userByEmail.studentInfo?.student_code || "");
  if (rowData.student_code && existingCode && existingCode !== rowData.student_code) {
    return { error: "El correo ya esta registrado con otro codigo institucional." };
  }

  return {
    user: userByEmail,
    studentInfo: userByEmail.studentInfo || null,
    matchedBy: "email"
  };
}

async function ensureUserProfile(user, rowData, transaction) {
  if (user.profile) return;
  if (!rowData.fullName) return;

  await DtInfo.create(
    {
      name: rowData.name || ".",
      lastname: rowData.lastname || ".",
      birthdate: rowData.birthdate,
      phone: rowData.phone || null,
      user_id: user.id
    },
    { transaction }
  );
}

async function linkExistingStudent({ lookup, rowData, sectionId, transaction }) {
  const user = lookup.user;
  let studentInfo = lookup.studentInfo;

  if (Number(user.level) !== ROLE_STUDENT) {
    return { error: "El correo existe, pero no corresponde a un usuario alumno." };
  }

  await ensureUserProfile(user, rowData, transaction);

  if (!studentInfo) {
    if (!rowData.student_code) {
      return { error: "El usuario existe, pero no tiene perfil de alumno y la fila no trae codigo." };
    }

    studentInfo = await InfoStudent.create(
      {
        user_id: user.id,
        student_code: rowData.student_code,
        id_section: Number(sectionId),
        status: "regular",
        id_sex: rowData.id_sex
      },
      { transaction }
    );

    return { linked: true, studentInfo };
  }

  const updates = {};
  if (rowData.student_code && !studentInfo.student_code) {
    updates.student_code = rowData.student_code;
  }

  if (Number(studentInfo.id_section) === Number(sectionId)) {
    if (Object.keys(updates).length) {
      await studentInfo.update(updates, { transaction });
    }
    return { skipped: true };
  }

  updates.id_section = Number(sectionId);
  await studentInfo.update(updates, { transaction });

  return { linked: true };
}

async function createNewStudent({ rowData, sectionId, transaction }) {
  if (!rowData.fullName) {
    return { error: "No se puede crear alumno sin nombre." };
  }

  if (!rowData.student_code) {
    return { error: "No se puede crear alumno sin codigo institucional." };
  }

  const initialPassword = buildInitialStudentPassword(rowData.passwordNameSource, rowData.student_code);
  if (!initialPassword) {
    return { error: "No se pudo generar la contrasena inicial con nombre y codigo." };
  }

  const passwordHash = await bcrypt.hash(initialPassword, 10);
  const user = await User.create(
    {
      email: rowData.email,
      password: passwordHash,
      must_change_password: true,
      level: ROLE_STUDENT
    },
    { transaction }
  );

  await DtInfo.create(
    {
      name: rowData.name || ".",
      lastname: rowData.lastname || ".",
      birthdate: rowData.birthdate,
      phone: rowData.phone || null,
      user_id: user.id
    },
    { transaction }
  );

  await InfoStudent.create(
    {
      user_id: user.id,
      student_code: rowData.student_code,
      id_section: Number(sectionId),
      status: "regular",
      id_sex: rowData.id_sex
    },
    { transaction }
  );

  return {
    created: true,
    initialPassword: {
      student_code: rowData.student_code,
      email: rowData.email,
      name: rowData.fullName,
      password: initialPassword
    }
  };
}

async function processStudentRow({ row, excelRow, sheetName, sectionId, sexCatalog }) {
  const rowData = parseStudentRow(row, sexCatalog);

  if (!rowData.student_code && !rowData.email) {
    return {
      error: rowError({
        sheetName,
        excelRow,
        rowData,
        message: "Falta codigo institucional. Si no hay codigo, debe existir correo para buscar al alumno."
      })
    };
  }

  if (rowData.email && !rowData.email.endsWith("@alumnos.udg.mx")) {
    return {
      error: rowError({
        sheetName,
        excelRow,
        rowData,
        message: "El correo debe terminar en @alumnos.udg.mx"
      })
    };
  }

  const transaction = await sequelize.transaction();

  try {
    const lookup = await findExistingStudent(rowData, transaction);
    if (lookup.error) {
      await transaction.rollback();
      return {
        error: rowError({ sheetName, excelRow, rowData, message: lookup.error })
      };
    }

    const result = lookup.user
      ? await linkExistingStudent({ lookup, rowData, sectionId, transaction })
      : await createNewStudent({ rowData, sectionId, transaction });

    if (result.error) {
      await transaction.rollback();
      return {
        error: rowError({ sheetName, excelRow, rowData, message: result.error })
      };
    }

    await transaction.commit();

    if (result.created) {
      return {
        created: true,
        initialPassword: {
          ...result.initialPassword,
          sheet: sheetName,
          row: excelRow
        }
      };
    }
    if (result.linked) return { linked: true };
    return { skipped: true };
  } catch (err) {
    await transaction.rollback();
    console.error("processStudentRow error:", err);
    return {
      error: rowError({
        sheetName,
        excelRow,
        rowData,
        message: "Error al procesar la fila."
      })
    };
  }
}

function rowHasRecognizedColumns(row) {
  return Boolean(
    pick(row, ["CODIGO", "CÓDIGO", "CODIGO INSTITUCIONAL", "CÓDIGO INSTITUCIONAL", "student_code", "code"]) ||
    pick(row, ["EMAIL", "CORREO", "CORREO INSTITUCIONAL", "email", "correo"]) ||
    pick(row, ["NOMBRE COMPLETO", "NOMBRE DEL ALUMNO", "ALUMNO", "ESTUDIANTE", "NOMBRE", "name"])
  );
}

function readRowsFromSheet(sheet) {
  const rowsFromSecondLine = XLSX.utils.sheet_to_json(sheet, { defval: "", range: 1 });
  if (rowsFromSecondLine.some(rowHasRecognizedColumns)) {
    return { rows: rowsFromSecondLine, firstDataRow: 3 };
  }

  return {
    rows: XLSX.utils.sheet_to_json(sheet, { defval: "", range: 0 }),
    firstDataRow: 2
  };
}

async function getSectionOrThrow(sectionId) {
  const section = await Section.findByPk(sectionId);
  if (!section) {
    const err = new Error("La seccion no existe.");
    err.status = 404;
    throw err;
  }
  return section;
}

async function importStudentsFromExcel({ buffer, sectionId }) {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sexCatalog = await Sex.findAll({ attributes: ["id_sex", "name_sex", "name_abbreviation"] });

  const result = {
    created: 0,
    linked: 0,
    skipped: 0,
    errors: [],
    initialPasswords: [],
    total: 0
  };

  const sheetsToProcess = [];
  if (sectionId) {
    const section = await getSectionOrThrow(sectionId);
    const sheetName = workbook.SheetNames[0];
    sheetsToProcess.push({ sheetName, sectionId: section.id_section });
  } else {
    for (const sheetName of workbook.SheetNames) {
      const section = await Section.findOne({ where: { name: sheetName } });
      if (!section) {
        result.errors.push({
          sheet: sheetName,
          row: null,
          error: `No existe una seccion con nombre '${sheetName}'.`
        });
        continue;
      }
      sheetsToProcess.push({ sheetName, sectionId: section.id_section });
    }
  }

  for (const item of sheetsToProcess) {
    const sheet = workbook.Sheets[item.sheetName];
    if (!sheet) continue;

    const { rows, firstDataRow } = readRowsFromSheet(sheet);
    result.total += rows.length;

    for (let index = 0; index < rows.length; index += 1) {
      const rowResult = await processStudentRow({
        row: rows[index],
        excelRow: firstDataRow + index,
        sheetName: item.sheetName,
        sectionId: item.sectionId,
        sexCatalog
      });

      if (rowResult.created) result.created += 1;
      else if (rowResult.linked) result.linked += 1;
      else if (rowResult.skipped) result.skipped += 1;

      if (rowResult.initialPassword) {
        result.initialPasswords.push(rowResult.initialPassword);
      }
      if (rowResult.error) result.errors.push(rowResult.error);
    }
  }

  return result;
}

module.exports = {
  importStudentsFromExcel,
  buildInitialStudentPassword
};
