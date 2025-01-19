const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST, // Ejemplo: smtp.gmail.com
  port: process.env.EMAIL_PORT || 587, // Puerto SMTP (587 para TLS)
  secure: false, // Cambiar a true si usas puerto 465
  auth: {
    user: process.env.EMAIL_USER, // Tu correo
    pass: process.env.EMAIL_PASS, // Contraseña o App Password
  },
});

const sendEmail = async (to, subject, text, html) => {
  const mailOptions = {
    from:
      process.env.EMAIL_FROM ||
      '"Sistema de Transferencia" <noreply@example.com>',
    to,
    subject,
    text, // Texto plano
    html, // HTML opcional
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`Correo enviado a ${to}`);
  } catch (error) {
    console.error("Error enviando correo:", error);
  }
};

module.exports = { sendEmail };
