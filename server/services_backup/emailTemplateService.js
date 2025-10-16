// services/emailTemplateService.js
const fs = require("fs");
const path = require("path");
const handlebars = require("handlebars");
const logger = require("./logger");

/**
 * Servicio para manejar plantillas de correos electrónicos
 */
class EmailTemplateService {
  /**
   * Renderiza una plantilla HTML con los datos proporcionados
   * @param {string} templateName - Nombre de la plantilla (sin extensión)
   * @param {Object} data - Datos para la plantilla
   * @returns {string} HTML renderizado
   */
  static renderTemplate(templateName, data = {}) {
    try {
      // Intentar cargar desde la carpeta de plantillas
      const templatePath = path.join(
        __dirname,
        "../templates",
        `${templateName}.html`
      );

      // Si no existe la carpeta o archivo, usar plantilla en memoria
      let templateContent;
      try {
        templateContent = fs.readFileSync(templatePath, "utf8");
      } catch (error) {
        logger.debug(
          `Plantilla ${templateName} no encontrada en disco, usando plantilla en memoria`
        );
        templateContent = this.getDefaultTemplate(templateName);
      }

      // Compilar y renderizar la plantilla
      const template = handlebars.compile(templateContent);
      return template(data);
    } catch (error) {
      logger.error(`Error al renderizar plantilla ${templateName}:`, error);
      // Fallback a una plantilla básica en caso de error
      return this.renderFallbackTemplate(data);
    }
  }

  /**
   * Devuelve el contenido de una plantilla predeterminada según el nombre
   * @param {string} templateName - Nombre de la plantilla
   * @returns {string} Contenido de la plantilla
   */
  static getDefaultTemplate(templateName) {
    switch (templateName) {
      case "traspaso":
        return `
        <!DOCTYPE html>
        <html lang="es">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>{{title}}</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 0 auto; padding: 20px; }
            .header { text-align: center; margin-bottom: 20px; }
            .header h1 { color: #2c3e50; margin-bottom: 5px; }
            .header p { color: #7f8c8d; margin-top: 0; }
            .summary { background-color: #f9f9f9; padding: 15px; border-radius: 5px; margin-bottom: 20px; }
            .summary h2 { margin-top: 0; color: #2c3e50; }
            .summary-item { display: flex; justify-content: space-between; margin-bottom: 10px; }
            .summary-label { font-weight: bold; }
            .success { color: #27ae60; }
            .error { color: #e74c3c; }
            .warning { color: #f39c12; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th { background-color: #2c3e50; color: white; text-align: left; padding: 10px; }
            td { padding: 8px; border-bottom: 1px solid #ddd; }
            tr:nth-child(even) { background-color: #f2f2f2; }
            .footer { margin-top: 30px; border-top: 1px solid #ddd; padding-top: 15px; color: #7f8c8d; font-size: 0.9em; }
            .note { font-style: italic; color: #7f8c8d; margin-top: 15px; }
            .btn { display: inline-block; padding: 10px 15px; background-color: #3498db; color: white; text-decoration: none; border-radius: 3px; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>{{title}}</h1>
            <p>{{subtitle}}</p>
          </div>
          
          <div class="summary">
            <h2>Resumen del Traspaso</h2>
            <div class="summary-item">
              <span class="summary-label">Estado:</span>
              <span class="{{#if success}}success{{else}}error{{/if}}">{{#if success}}✅ Éxito{{else}}❌ Error{{/if}}</span>
            </div>
            <div class="summary-item">
              <span class="summary-label">Documento:</span>
              <span>{{documento_inv}}</span>
            </div>
            <div class="summary-item">
              <span class="summary-label">Líneas Procesadas:</span>
              <span>{{totalLineas}}</span>
            </div>
            <div class="summary-item">
              <span class="summary-label">Líneas Exitosas:</span>
              <span>{{lineasExitosas}}</span>
            </div>
            <div class="summary-item">
              <span class="summary-label">Líneas Fallidas:</span>
              <span>{{lineasFallidas}}</span>
            </div>
            <div class="summary-item">
              <span class="summary-label">Ruta/Bodega Destino:</span>
              <span>{{route}}</span>
            </div>
            {{#unless success}}
            <div class="summary-item">
              <span class="summary-label">Error:</span>
              <span class="error">{{errorDetail}}</span>
            </div>
            {{/unless}}
          </div>
          
          {{#if detalleProductos}}
          <h3>Detalle de Productos Traspasados</h3>
          <table>
            <thead>
              <tr>
                <th>Artículo</th>
                <th>Descripción</th>
                <th style="text-align: right;">Cantidad</th>
              </tr>
            </thead>
            <tbody>
              {{#each detalleProductos}}
              <tr>
                <td>{{codigo}}</td>
                <td>{{descripcion}}</td>
                <td style="text-align: right;">{{cantidad}}</td>
              </tr>
              {{/each}}
            </tbody>
          </table>
          {{/if}}
          
          <div class="note">
            <p>Este traspaso fue ejecutado a las {{timestamp}}.</p>
          </div>
          
          <div class="footer">
            <p>Este es un correo automático generado por el sistema de traspaso. Por favor no responda a este correo.</p>
          </div>
        </body>
        </html>
        `;

      case "transferenciasAutomaticas":
        return `
        <!DOCTYPE html>
        <html lang="es">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>{{title}}</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 0 auto; padding: 20px; }
            .header { text-align: center; margin-bottom: 20px; }
            .header h1 { color: #2c3e50; margin-bottom: 5px; }
            .header p { color: #7f8c8d; margin-top: 0; }
            .summary { background-color: #f9f9f9; padding: 15px; border-radius: 5px; margin-bottom: 20px; }
            .summary h2 { margin-top: 0; color: #2c3e50; }
            .summary-item { display: flex; justify-content: space-between; margin-bottom: 10px; }
            .summary-label { font-weight: bold; }
            .success { color: #27ae60; }
            .error { color: #e74c3c; }
            .warning { color: #f39c12; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th { background-color: #2c3e50; color: white; text-align: left; padding: 10px; }
            td { padding: 8px; border-bottom: 1px solid #ddd; }
            tr:nth-child(even) { background-color: #f2f2f2; }
            .footer { margin-top: 30px; border-top: 1px solid #ddd; padding-top: 15px; color: #7f8c8d; font-size: 0.9em; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>{{title}}</h1>
            <p>{{subtitle}}</p>
          </div>
          
          <div class="summary">
            <h2>Resumen de Transferencias</h2>
            <div class="summary-item">
              <span class="summary-label">Exitosas:</span>
              <span class="success">{{successCount}}</span>
            </div>
            <div class="summary-item">
              <span class="summary-label">Fallidas:</span>
              <span class="{{#if failedCount}}error{{else}}success{{/if}}">{{failedCount}}</span>
            </div>
            <div class="summary-item">
              <span class="summary-label">Hora programada:</span>
              <span>{{scheduledHour}}</span>
            </div>
          </div>
          
          <h3>Detalle de Transferencias</h3>
          <table>
            <thead>
              <tr>
                <th>Transferencia</th>
                <th>Estado</th>
                <th>Registros</th>
                <th>Insertados</th>
                <th>Duplicados</th>
                <th>Detalles</th>
              </tr>
            </thead>
            <tbody>
              {{#each results}}
              <tr>
                <td><strong>{{name}}</strong></td>
                <td style="text-align: center;">{{#if success}}✅{{else}}❌{{/if}}</td>
                <td style="text-align: right;">{{rows}}</td>
                <td style="text-align: right;">{{inserted}}</td>
                <td style="text-align: right;">{{duplicates}}</td>
                <td>{{#if success}}Completada{{else}}Error: {{errorDetail}}{{/if}}</td>
              </tr>
              {{/each}}
            </tbody>
          </table>
          
          {{#if resultsWithDuplicates}}
          <h2>Detalle de registros duplicados por transferencia</h2>
          {{#each resultsWithDuplicates}}
          <h3>Transferencia: {{name}} {{#if hasMoreDuplicates}}(primeros {{duplicatedRecords.length}} de {{totalDuplicates}} duplicados){{else}}({{duplicates}} duplicados){{/if}}</h3>
          <table>
            <thead>
              <tr>
                {{#each columns}}
                <th>{{this}}</th>
                {{/each}}
              </tr>
            </thead>
            <tbody>
              {{#each duplicatedRecords}}
              <tr>
                {{#each this}}
                <td>{{this}}</td>
                {{/each}}
              </tr>
              {{/each}}
            </tbody>
          </table>
          {{#if hasMoreDuplicates}}
          <p><em>Nota: Se muestran solo los primeros {{duplicatedRecords.length}} de {{totalDuplicates}} registros duplicados omitidos.</em></p>
          {{/if}}
          {{/each}}
          {{/if}}
          
          <div class="footer">
            <p>Este es un correo automático generado por el sistema de transferencias programadas.</p>
          </div>
        </body>
        </html>
        `;

      case "errorCritico":
        return `
        <!DOCTYPE html>
        <html lang="es">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Error Crítico</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { text-align: center; margin-bottom: 20px; }
            .header h1 { color: #e74c3c; margin-bottom: 5px; }
            .error-box { background-color: #fdeaea; border-left: 4px solid #e74c3c; padding: 15px; margin-bottom: 20px; }
            .error-message { font-weight: bold; }
            .details { margin-top: 20px; }
            .details-item { margin-bottom: 10px; }
            .label { font-weight: bold; }
            .footer { margin-top: 30px; border-top: 1px solid #ddd; padding-top: 15px; color: #7f8c8d; font-size: 0.9em; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>🚨 Error Crítico</h1>
            <p>{{title}}</p>
          </div>
          
          <div class="error-box">
            <p class="error-message">{{errorMessage}}</p>
          </div>
          
          <div class="details">
            <div class="details-item">
              <span class="label">Hora programada:</span>
              <span>{{scheduledHour}}</span>
            </div>
            {{#if timestamp}}
            <div class="details-item">
              <span class="label">Tiempo de ocurrencia:</span>
              <span>{{timestamp}}</span>
            </div>
            {{/if}}
            {{#if additionalInfo}}
            <div class="details-item">
              <span class="label">Información adicional:</span>
              <span>{{additionalInfo}}</span>
            </div>
            {{/if}}
          </div>
          
          <div class="footer">
            <p>Este es un correo automático generado por el sistema. Por favor no responda a este correo.</p>
          </div>
        </body>
        </html>
        `;

      // Plantilla base por defecto
      default:
        return `
        <!DOCTYPE html>
        <html lang="es">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>{{title}}</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .header { margin-bottom: 20px; }
            .header h1 { color: #2c3e50; }
            .content { margin-bottom: 20px; }
            .footer { margin-top: 30px; border-top: 1px solid #ddd; padding-top: 15px; color: #7f8c8d; font-size: 0.9em; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>{{title}}</h1>
          </div>
          
          <div class="content">
            {{{content}}}
          </div>
          
          <div class="footer">
            <p>Este es un correo automático generado por el sistema. Por favor no responda a este correo.</p>
          </div>
        </body>
        </html>
        `;
    }
  }

  /**
   * Renderiza una plantilla de fallback en caso de error
   * @param {Object} data - Datos disponibles
   * @returns {string} HTML de la plantilla de fallback
   */
  static renderFallbackTemplate(data) {
    // Plantilla mínima de emergencia
    const fallbackTemplate = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>${data.title || "Notificación"}</title>
    </head>
    <body>
      <h1>${data.title || "Notificación del Sistema"}</h1>
      <p>${data.content || JSON.stringify(data)}</p>
      <hr>
      <p><small>Este es un correo automático.</small></p>
    </body>
    </html>
    `;

    return fallbackTemplate;
  }

  /**
   * Genera un texto plano basado en datos HTML o JSON
   * @param {Object} data - Datos para generar el texto plano
   * @returns {string} Texto plano para email
   */
  static generatePlainText(data) {
    try {
      let plainText = "";

      // Intentar generar un texto plano basado en los datos más comunes
      if (data.title) {
        plainText += `${data.title.toUpperCase()}\n\n`;
      }

      if (data.subtitle) {
        plainText += `${data.subtitle}\n\n`;
      }

      // Si es un traspaso
      if (data.documento_inv) {
        plainText += `RESUMEN DEL TRASPASO\n`;
        plainText += `Estado: ${data.success ? "Éxito" : "Error"}\n`;
        plainText += `Documento: ${data.documento_inv}\n`;
        plainText += `Líneas Procesadas: ${data.totalLineas}\n`;
        plainText += `Líneas Exitosas: ${data.lineasExitosas}\n`;
        plainText += `Líneas Fallidas: ${data.lineasFallidas}\n`;
        plainText += `Ruta/Bodega Destino: ${data.route}\n`;

        if (!data.success && data.errorDetail) {
          plainText += `Error: ${data.errorDetail}\n`;
        }

        if (data.detalleProductos && data.detalleProductos.length > 0) {
          plainText += `\nDETALLE DE PRODUCTOS TRASPASADOS\n`;
          plainText += `Artículo\tDescripción\tCantidad\n`;

          data.detalleProductos.forEach((producto) => {
            plainText += `${producto.codigo}\t${producto.descripcion}\t${producto.cantidad}\n`;
          });
        }
      }

      // Si son transferencias automáticas
      if (data.results) {
        plainText += `RESUMEN DE TRANSFERENCIAS\n`;
        plainText += `Exitosas: ${data.successCount}\n`;
        plainText += `Fallidas: ${data.failedCount}\n`;
        plainText += `Hora programada: ${data.scheduledHour}\n\n`;

        plainText += `DETALLE DE TRANSFERENCIAS\n`;
        data.results.forEach((result) => {
          plainText += `- ${result.name}: ${
            result.success ? "Éxito" : "Error"
          } - ${result.rows} registros, ${result.inserted} insertados, ${
            result.duplicates || 0
          } duplicados\n`;
          if (!result.success) {
            plainText += `  Error: ${result.errorDetail}\n`;
          }
        });
      }

      // Si es un error crítico
      if (data.errorMessage) {
        plainText += `ERROR CRÍTICO\n\n`;
        plainText += `${data.errorMessage}\n\n`;

        if (data.scheduledHour) {
          plainText += `Hora programada: ${data.scheduledHour}\n`;
        }

        if (data.timestamp) {
          plainText += `Tiempo de ocurrencia: ${data.timestamp}\n`;
        }

        if (data.additionalInfo) {
          plainText += `Información adicional: ${data.additionalInfo}\n`;
        }
      }

      // Si solo hay contenido genérico
      if (data.content) {
        plainText += data.content;
      }

      plainText += `\n\nEste es un correo automático generado por el sistema. Por favor no responda a este correo.`;

      return plainText;
    } catch (error) {
      logger.error("Error al generar texto plano:", error);
      // Si hay un error, devolver un texto simple con los datos en JSON
      return `Notificación del sistema\n\n${JSON.stringify(
        data,
        null,
        2
      )}\n\nEste es un correo automático.`;
    }
  }
}

module.exports = EmailTemplateService;
