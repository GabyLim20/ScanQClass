"use strict";

const SUPER_ADMIN_EMAILS = new Set([
  "admin@sems.udg.mx",
  "veronica.becerra@sems.udg.mx"
]);

function normalizeUserEmail(email = "") {
  return String(email || "").trim().toLowerCase();
}

function isReservedSuperAdminEmail(email = "") {
  return SUPER_ADMIN_EMAILS.has(normalizeUserEmail(email));
}

module.exports = {
  SUPER_ADMIN_EMAILS,
  normalizeUserEmail,
  isReservedSuperAdminEmail
};
