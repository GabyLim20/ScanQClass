"use strict";

const nodemailer = require("nodemailer");

function isMailConfigured() {
    return Boolean(
        process.env.SMTP_HOST &&
        process.env.SMTP_PORT &&
        process.env.SMTP_USER &&
        process.env.SMTP_PASS &&
        process.env.MAIL_FROM
    );
}

function createTransport() {
    return nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: Number(process.env.SMTP_PORT) === 465,
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
        }
    });
}

async function sendMailSafe({ to, subject, html, text }) {
    if (!to) {
        return { sent: false, reason: "missing-recipient" };
    }

    if (!isMailConfigured()) {
        return { sent: false, reason: "smtp-not-configured" };
    }

    const transport = createTransport();
    await transport.sendMail({
        from: process.env.MAIL_FROM,
        to,
        subject,
        text,
        html
    });

    return { sent: true };
}

module.exports = {
    isMailConfigured,
    sendMailSafe
};
