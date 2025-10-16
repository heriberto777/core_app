const logger = require("./logger");
const { SqlService } = require("./SqlService");

class SequenceManager {
  /**
   * Initialize the sequence manager
   * @param {Object} connection - Database connection
   * @param {string} sequenceTable - Table name storing sequences
   * @param {Object} config - Sequence configuration
   */
  constructor(connection, sequenceTable, config = {}) {
    this.connection = connection;
    this.sequenceTable = sequenceTable;
    this.config = {
      defaultPadLength: config.defaultPadLength || 7,
      defaultPadChar: config.defaultPadChar || "0",
      sequenceField: config.sequenceField || "valor",
      nameField: config.nameField || "nombre",
      segmentField: config.segmentField || null,
    };

    // Cache for current sequence values
    this.sequenceCache = new Map();
  }

  /**
   * Get next value for a sequence
   * @param {string} sequenceName - Name of the sequence
   * @param {Object} options - Formatting options
   * @returns {Promise<string>} - Formatted sequence value
   */
  async getNextSequence(sequenceName, options = {}) {
    try {
      // Normalize options
      const opts = {
        prefix: options.prefix || "",
        suffix: options.suffix || "",
        padLength: options.padLength || this.config.defaultPadLength,
        padChar: options.padChar || this.config.defaultPadChar,
        segmentValue: options.segmentValue || null,
        incrementBy: options.incrementBy || 1,
      };

      // Create cache key that includes segment if used
      const cacheKey = opts.segmentValue
        ? `${sequenceName}:${opts.segmentValue}`
        : sequenceName;

      // Try to use cached value first
      let sequenceValue = this.sequenceCache.get(cacheKey);
      let needsUpdate = false;

      if (!sequenceValue) {
        // If not in cache, get from database
        sequenceValue = await this.getSequenceFromDatabase(
          sequenceName,
          opts.segmentValue
        );
        needsUpdate = true;
      } else {
        // If in cache, increment by specified amount
        sequenceValue = parseInt(sequenceValue, 10) + opts.incrementBy;
        this.sequenceCache.set(cacheKey, sequenceValue);
        needsUpdate = true;
      }

      // Update database with new value (can be async)
      if (needsUpdate) {
        this.updateSequenceInDatabase(
          sequenceName,
          sequenceValue,
          opts.segmentValue
        );
      }

      // Format the sequence value
      const formattedValue = this.formatSequenceValue(
        sequenceValue,
        opts.prefix,
        opts.suffix,
        opts.padLength,
        opts.padChar
      );

      return formattedValue;
    } catch (error) {
      logger.error(
        `Error getting next sequence for ${sequenceName}: ${error.message}`
      );
      throw error;
    }
  }

  /**
   * Format a sequence value according to options
   * @param {number} value - Numeric sequence value
   * @param {string} prefix - Prefix to add
   * @param {string} suffix - Suffix to add
   * @param {number} padLength - Length to pad to
   * @param {string} padChar - Character to use for padding
   * @returns {string} - Formatted sequence value
   */
  formatSequenceValue(value, prefix, suffix, padLength, padChar) {
    // Convert to string and pad
    const paddedValue = String(value).padStart(padLength, padChar);

    // Add prefix and suffix
    return `${prefix}${paddedValue}${suffix}`;
  }

  /**
   * Get sequence value from database
   * @param {string} sequenceName - Name of sequence
   * @param {string} segmentValue - Segment value if using segmentation
   * @returns {Promise<number>} - Current sequence value
   */
  async getSequenceFromDatabase(sequenceName, segmentValue = null) {
    try {
      let query;
      const params = { sequenceName };

      if (this.config.segmentField && segmentValue) {
        // Query with segmentation
        query = `
          SELECT ${this.config.sequenceField}
          FROM ${this.sequenceTable}
          WHERE ${this.config.nameField} = @sequenceName
          AND ${this.config.segmentField} = @segmentValue
        `;
        params.segmentValue = segmentValue;
      } else {
        // Query without segmentation
        query = `
          SELECT ${this.config.sequenceField}
          FROM ${this.sequenceTable}
          WHERE ${this.config.nameField} = @sequenceName
        `;
      }

      const result = await SqlService.query(this.connection, query, params);

      if (result.recordset && result.recordset.length > 0) {
        // Found existing sequence
        const value = result.recordset[0][this.config.sequenceField];
        return parseInt(value, 10);
      } else {
        // No sequence found, create with initial value of 1
        await this.createSequence(sequenceName, 1, segmentValue);
        return 1;
      }
    } catch (error) {
      logger.error(`Error getting sequence from database: ${error.message}`);
      throw error;
    }
  }

  /**
   * Create a new sequence in the database
   * @param {string} sequenceName - Name of sequence
   * @param {number} initialValue - Initial value
   * @param {string} segmentValue - Segment value if using segmentation
   * @returns {Promise<void>}
   */
  async createSequence(sequenceName, initialValue = 1, segmentValue = null) {
    try {
      let query;
      const params = {
        sequenceName,
        sequenceValue: initialValue,
      };

      if (this.config.segmentField && segmentValue) {
        // Insert with segmentation
        query = `
          INSERT INTO ${this.sequenceTable} (
            ${this.config.nameField}, 
            ${this.config.sequenceField}, 
            ${this.config.segmentField}
          ) VALUES (
            @sequenceName, 
            @sequenceValue, 
            @segmentValue
          )
        `;
        params.segmentValue = segmentValue;
      } else {
        // Insert without segmentation
        query = `
          INSERT INTO ${this.sequenceTable} (
            ${this.config.nameField}, 
            ${this.config.sequenceField}
          ) VALUES (
            @sequenceName, 
            @sequenceValue
          )
        `;
      }

      await SqlService.query(this.connection, query, params);
      logger.info(
        `Created new sequence ${sequenceName} with initial value ${initialValue}`
      );
    } catch (error) {
      logger.error(`Error creating sequence: ${error.message}`);
      throw error;
    }
  }

  /**
   * Update sequence value in database
   * @param {string} sequenceName - Name of sequence
   * @param {number} newValue - New sequence value
   * @param {string} segmentValue - Segment value if using segmentation
   * @returns {Promise<void>}
   */
  async updateSequenceInDatabase(sequenceName, newValue, segmentValue = null) {
    try {
      let query;
      const params = {
        sequenceName,
        sequenceValue: newValue,
      };

      if (this.config.segmentField && segmentValue) {
        // Update with segmentation
        query = `
          UPDATE ${this.sequenceTable}
          SET ${this.config.sequenceField} = @sequenceValue
          WHERE ${this.config.nameField} = @sequenceName
          AND ${this.config.segmentField} = @segmentValue
        `;
        params.segmentValue = segmentValue;
      } else {
        // Update without segmentation
        query = `
          UPDATE ${this.sequenceTable}
          SET ${this.config.sequenceField} = @sequenceValue
          WHERE ${this.config.nameField} = @sequenceName
        `;
      }

      await SqlService.query(this.connection, query, params);

      // Update cache with new value
      const cacheKey = segmentValue
        ? `${sequenceName}:${segmentValue}`
        : sequenceName;
      this.sequenceCache.set(cacheKey, newValue);

      logger.debug(`Updated sequence ${sequenceName} to ${newValue}`);
    } catch (error) {
      logger.error(`Error updating sequence: ${error.message}`);
      throw error;
    }
  }

  /**
   * Clear the sequence cache
   */
  clearCache() {
    this.sequenceCache.clear();
  }
}

module.exports = SequenceManager;
