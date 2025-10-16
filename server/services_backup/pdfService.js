// services/pdfService.js
const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { v4: uuidv4 } = require("uuid");
const logger = require("./logger");
const EmailTemplateService = require("./emailTemplateService");

/**
 * Servicio para generar archivos PDF
 */
class PDFService {
  /**
   * Genera un PDF a partir de contenido HTML
   * @param {string} htmlContent - Contenido HTML para convertir a PDF
   * @param {Object} options - Opciones de configuración
   * @returns {Promise<Buffer>} - Buffer con el contenido del PDF
   */
  static async generatePDF(htmlContent, options = {}) {
    let browser = null;

    try {
      // Opciones predeterminadas
      const defaultOptions = {
        format: "A4",
        printBackground: true,
        margin: {
          top: "1cm",
          right: "1cm",
          bottom: "1cm",
          left: "1cm",
        },
        preferCSSPageSize: true,
        ...options,
      };

      // Iniciar navegador con opciones para entorno de producción
      browser = await puppeteer.launch({
        headless: "new", // Usar el nuevo modo headless
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
        ],
      });

      const page = await browser.newPage();

      // Establecer contenido HTML
      await page.setContent(htmlContent, { waitUntil: "networkidle0" });

      // Generar PDF
      const pdfBuffer = await page.pdf(defaultOptions);

      return pdfBuffer;
    } catch (error) {
      logger.error(`Error al generar PDF: ${error.message}`, error);
      throw error;
    } finally {
      // Cerrar el navegador para liberar recursos
      if (browser) {
        await browser.close();
      }
    }
  }

  /**
   * Guarda un buffer PDF en el sistema de archivos
   * @param {Buffer} pdfBuffer - Buffer PDF a guardar
   * @param {string} filename - Nombre de archivo (opcional, se generará uno aleatorio si no se proporciona)
   * @returns {Promise<string>} - Ruta completa del archivo guardado
   */
  static async savePDFToFile(pdfBuffer, filename = null) {
    try {
      // Crear directorio temporal si no existe
      const tempDir = path.join(os.tmpdir(), "app_pdfs");
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      // Generar nombre de archivo único si no se proporcionó
      const finalFilename = filename || `traspaso_${uuidv4()}.pdf`;
      const filePath = path.join(tempDir, finalFilename);

      // Guardar archivo
      fs.writeFileSync(filePath, pdfBuffer);
      logger.info(`PDF guardado en: ${filePath}`);

      return filePath;
    } catch (error) {
      logger.error(`Error al guardar PDF: ${error.message}`, error);
      throw error;
    }
  }

  /**
   * Genera un PDF de traspaso a partir de los datos
   * @param {Object} traspasoData - Datos del traspaso
   * @returns {Promise<{buffer: Buffer, path: string}>} - Buffer y ruta del PDF generado
   */
  static async generateTraspasoPDF(traspasoData) {
    try {
      // Añadir timestamp si no existe
      if (!traspasoData.timestamp) {
        traspasoData.timestamp = new Date().toLocaleString();
      }

      // Añadir título y subtítulo si no existen
      if (!traspasoData.title) {
        traspasoData.title = traspasoData.success
          ? `Traspaso de Bodega Completado: ${traspasoData.documento_inv || ""}`
          : `Error en Traspaso de Bodega: ${
              traspasoData.documento_inv || "N/A"
            }`;
      }

      if (!traspasoData.subtitle) {
        traspasoData.subtitle = `Bodega Destino: ${
          traspasoData.route || "N/A"
        }`;
      }

      // Renderizar HTML usando el servicio de plantillas
      const htmlContent = EmailTemplateService.renderTemplate(
        "traspaso",
        traspasoData
      );

      // Generar PDF
      const pdfBuffer = await this.generatePDF(htmlContent);

      // Guardar PDF en archivo
      const filename = `traspaso_${traspasoData.documento_inv || uuidv4()}.pdf`;
      const filePath = await this.savePDFToFile(pdfBuffer, filename);

      return {
        buffer: pdfBuffer,
        path: filePath,
      };
    } catch (error) {
      logger.error(`Error al generar PDF de traspaso: ${error.message}`, error);
      throw error;
    }
  }

  /**
   * Elimina un archivo PDF temporal
   * @param {string} filePath - Ruta del archivo a eliminar
   * @returns {Promise<boolean>} - true si se eliminó correctamente
   */
  static async cleanupTempFile(filePath) {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        logger.debug(`Archivo temporal eliminado: ${filePath}`);
        return true;
      }
      return false;
    } catch (error) {
      logger.warn(
        `Error al eliminar archivo temporal ${filePath}: ${error.message}`
      );
      return false;
    }
  }
}

module.exports = PDFService;
