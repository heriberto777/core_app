const validationRules = {
  clientes: {
    requiredFields: ["Code_ofClient", "Name1", "Address1"],
    existenceCheck: { table: "dbo.IMPLT_accounts", key: "Code_ofClient" },
  },
  productos: {
    requiredFields: ["Code_Product", "Description", "Price"],
    existenceCheck: { table: "telynet.implt_product", key: "Code_Product" },
  },
  cobros: {
    requiredFields: ["Code_Receipt", "Amount", "Date"],
    existenceCheck: { table: "telynet.implt_receipts", key: "Code_Receipt" },
  },
};

module.exports = validationRules;
