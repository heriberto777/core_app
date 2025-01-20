const validationRules = {
  clientes: {
    requiredFields: ["Code_ofClient", "Name1", "Address1"],
    existenceCheck: { table: "dbo.IMPLT_accounts", key: "Code_ofClient" },
  },

  accounts_agrupation1: {
    requiredFields: ["Code", "Description"],
    existenceCheck: {
      table: "dbo.IMPLT_accounts_agrupation1",
      key: "Code",
    },
  },
  accounts_agrupation2: {
    requiredFields: ["Code", "Description"],
    existenceCheck: {
      table: "dbo.IMPLT_accounts_agrupation2",
      key: "Code",
    },
  },
  accounts_agrupation3: {
    requiredFields: ["Code", "Description"],
    existenceCheck: {
      table: "dbo.IMPLT_accounts_agrupation3",
      key: "Code",
    },
  },
  accounts_credit: {
    requiredFields: ["Code_Account"],
    existenceCheck: {
      table: "dbo.IMPLT_accounts_credit",
      key: "Code_Account",
    },
  },
  payment_termt: {
    requiredFields: ["Code", "Description"],
    existenceCheck: {
      table: "dbo.IMPLT_payment_term",
      key: "Code",
    },
  },
  products: {
    requiredFields: ["Code_ofClient", "Description"],
    existenceCheck: {
      table: "dbo.IMPLT_products",
      key: "Code_ofClient",
    },
  },
  products_hierarchy2: {
    requiredFields: ["Code", "Code_Hierarchy1"],
    existenceCheck: {
      table: "dbo.IMPLT_products_hierarchy2",
      key: "Code",
    },
  },
  products_hierarchy3: {
    requiredFields: ["Code", "Code_Hierarchy1", "Code_Hierarchy2"],
    existenceCheck: {
      table: "dbo.IMPLT_products_hierarchy3",
      key: "Code",
    },
  },
  products_hierarchy4: {
    requiredFields: [
      "Code",
      "Code_Hierarchy1",
      "Code_Hierarchy2",
      "Code_Hierarchy3",
    ],
    existenceCheck: {
      table: "dbo.IMPLT_products_hierarchy4",
      key: "Code",
    },
  },
  products_measure: {
    requiredFields: ["Code_Product"],
    existenceCheck: {
      table: "dbo.IMPLT_products_measure",
      key: "Code_Product",
    },
  },
  collections_pending: {
    requiredFields: ["Num_Invoice", "NumDocum"],
    existenceCheck: {
      table: "dbo.IMPLT_collections_pending",
      key: "Num_Invoice",
    },
  },
  hist_orders: {
    requiredFields: ["Order_Num"],
    existenceCheck: {
      table: "dbo.IMPLT_hist_orders",
      key: "Order_Num",
    },
  },
  trucks: {
    requiredFields: ["Code", "Description"],
    existenceCheck: {
      table: "dbo.IMPLT_trucks",
      key: "Code",
    },
  },
};

module.exports = validationRules;
