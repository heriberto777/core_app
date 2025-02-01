const validationRules = {
  IMPLT_accounts: {
    requiredFields: ["Code_ofClient", "Name1"],
    existenceCheck: { table: "dbo.IMPLT_accounts", key: "Code_ofClient" },
  },
  IMPLT_accounts_agrupation1: {
    requiredFields: ["Code", "Description"],
    existenceCheck: { table: "dbo.IMPLT_accounts_agrupation1", key: "Code" },
  },
  IMPLT_accounts_agrupation2: {
    requiredFields: ["Code", "Code_Agrupation1", "Description"],
    existenceCheck: { table: "dbo.IMPLT_accounts_agrupation2", key: "Code" },
  },
  IMPLT_accounts_agrupation3: {
    requiredFields: ["Code", "Description"],
    existenceCheck: { table: "dbo.IMPLT_accounts_agrupation3", key: "Code" },
  },
  IMPLT_accounts_array: {
    requiredFields: ["Code", "Type", "Description"],
    existenceCheck: { table: "dbo.IMPLT_accounts_array", key: "Code" },
  },
  IMPLT_accounts_credit: {
    requiredFields: ["Code_Account", "Credit_Limit", "Credit_Consum"],
    existenceCheck: {
      table: "dbo.IMPLT_accounts_credit",
      key: "Code_Account",
    },
  },
  IMPLT_accounts_function: {
    requiredFields: ["Code_Account", "Code_Function"],
    existenceCheck: {
      table: "dbo.IMPLT_accounts_function",
      key: "Code_Account",
    },
  },
  IMPLT_accounts_org: {
    requiredFields: ["Code_Account", "Code_Unit_Org", "Code_Sales_Org"],
    existenceCheck: { table: "dbo.IMPLT_accounts_org", key: "Code_Account" },
  },
  IMPLT_accounts_organ_credit: {
    requiredFields: ["Code_Account", "Credit_Limit", "Credit_Consum"],
    existenceCheck: {
      table: "dbo.IMPLT_accounts_organ_credit",
      key: "Code_Account",
    },
  },
  IMPLT_accounts_organization: {
    requiredFields: ["Code_Account", "Code_Seller"],
    existenceCheck: {
      table: "dbo.IMPLT_accounts_organization",
      key: "Code_Account",
    },
  },
  IMPLT_accounts_payment: {
    requiredFields: ["Code_Account", "Code_Payment"],
    existenceCheck: {
      table: "dbo.IMPLT_accounts_payment",
      key: "Code_Account",
    },
  },
  IMPLT_addresses: {
    requiredFields: ["Code_ofClient", "Code_Country", "Address1"],
    existenceCheck: { table: "dbo.IMPLT_addresses", key: "Code_ofClient" },
  },
  IMPLT_addresses_accounts: {
    requiredFields: ["Code_Address", "Code_Account"],
    existenceCheck: {
      table: "dbo.IMPLT_addresses_accounts",
      key: "Code_Address",
    },
  },
  IMPLT_addresses_org: {
    requiredFields: ["Code_Address", "Code_Unit_Org"],
    existenceCheck: { table: "dbo.IMPLT_addresses_org", key: "Code_Address" },
  },
  IMPLT_addresses_organization: {
    requiredFields: ["Code_Address", "Code_Seller"],
    existenceCheck: {
      table: "dbo.IMPLT_addresses_organization",
      key: "Code_Address",
    },
  },
  implt_Cluster_Base: {
    requiredFields: [
      "Code_Unit_Org",
      "Bronze_Base",
      "Silver_Base",
      "Gold_Base",
    ],
    existenceCheck: { table: "dbo.implt_Cluster_Base", key: "Code_Unit_Org" },
  },
  IMPLT_CLUSTER_OBJETIVE: {
    requiredFields: ["Code_Seller"],
    existenceCheck: { table: "dbo.IMPLT_CLUSTER_OBJETIVE", key: "Code_Seller" },
  },
  IMPLT_collections_pending: {
    requiredFields: ["Num_Invoice"],
    existenceCheck: {
      table: "dbo.IMPLT_collections_pending",
      key: "Num_Invoice",
    },
  },
  IMPLT_contacts: {
    requiredFields: ["Code_ofClient", "Name1"],
    existenceCheck: { table: "dbo.IMPLT_contacts", key: "Code_ofClient" },
  },
  IMPLT_contacts_accounts: {
    requiredFields: ["Code_Contact", "Code_Account"],
    existenceCheck: {
      table: "dbo.IMPLT_contacts_accounts",
      key: "Code_Contact",
    },
  },
  IMPLT_contacts_array: {
    requiredFields: ["Code", "Type", "Description"],
    existenceCheck: { table: "dbo.IMPLT_contacts_array", key: "Code" },
  },
  IMPLT_contacts_organization: {
    requiredFields: ["Code_Contact"],
    existenceCheck: {
      table: "dbo.IMPLT_contacts_organization",
      key: "Code_Contact",
    },
  },
  IMPLT_hist_orders: {
    requiredFields: ["Order_Num", "Code_Account"],
    existenceCheck: { table: "dbo.IMPLT_hist_orders", key: "Order_Num" },
  },
  IMPLT_loads_detail: {
    requiredFields: ["Code", "Code_Product"],
    existenceCheck: { table: "dbo.IMPLT_loads_detail", key: "Code" },
  },
  IMPLT_orders: {
    requiredFields: ["Order_Num", "Code_Account"],
    existenceCheck: { table: "dbo.IMPLT_orders", key: "Order_Num" },
  },
  IMPLT_payment_org_terms: {
    requiredFields: ["Code", "Description"],
    existenceCheck: { table: "dbo.IMPLT_payment_org_terms", key: "Code" },
  },
  IMPLT_payment_term: {
    requiredFields: ["Code", "Description"],
    existenceCheck: { table: "dbo.IMPLT_payment_term", key: "Code" },
  },
  IMPLT_pricing: {
    requiredFields: ["Code1", "Code2", "Code3"],
    existenceCheck: { table: "dbo.IMPLT_pricing", key: "Code1" },
  },
  IMPLT_products: {
    requiredFields: ["Code_ofClient", "Description"],
    existenceCheck: { table: "dbo.IMPLT_products", key: "Code_ofClient" },
  },
  IMPLT_products_array: {
    requiredFields: ["Code", "Description"],
    existenceCheck: { table: "dbo.IMPLT_products_array", key: "Code" },
  },
  IMPLT_products_hierarchy2: {
    requiredFields: ["Code", "Code_Hierarchy1"],
    existenceCheck: { table: "dbo.IMPLT_products_hierarchy2", key: "Code" },
  },
  IMPLT_products_hierarchy3: {
    requiredFields: ["Code", "Code_Hierarchy2"],
    existenceCheck: { table: "dbo.IMPLT_products_hierarchy3", key: "Code" },
  },
  IMPLT_products_hierarchy4: {
    requiredFields: ["Code", "Code_Hierarchy3"],
    existenceCheck: { table: "dbo.IMPLT_products_hierarchy4", key: "Code" },
  },
  IMPLT_products_measure: {
    requiredFields: ["Code_Product", "Unit_Measure"],
    existenceCheck: {
      table: "dbo.IMPLT_products_measure",
      key: "Code_Product",
    },
  },
  IMPLT_products_organization: {
    requiredFields: ["Code_Product", "Code_Unit_Org"],
    existenceCheck: {
      table: "dbo.IMPLT_products_organization",
      key: "Code_Product",
    },
  },
  IMPLT_products_packs: {
    requiredFields: ["Code_Product", "Code_Component"],
    existenceCheck: { table: "dbo.IMPLT_products_packs", key: "Code_Product" },
  },
  IMPLT_provinces: {
    requiredFields: ["Code", "Description"],
    existenceCheck: { table: "dbo.IMPLT_provinces", key: "Code" },
  },
  IMPLT_route_accounts: {
    requiredFields: ["Code_Account", "Code_Route"],
    existenceCheck: { table: "dbo.IMPLT_route_accounts", key: "Code_Account" },
  },
  IMPLT_trucks: {
    requiredFields: ["Code", "Description"],
    existenceCheck: { table: "dbo.IMPLT_trucks", key: "Code" },
  },
  IMPLT_sellers: {
    requiredFields: ["Code_Seller", "Name"],
    existenceCheck: { table: "dbo.IMPLT_sellers", key: "Code_Seller" },
  },
  IMPLT_sellers_org: {
    requiredFields: ["Code_Seller"],
    existenceCheck: { table: "dbo.IMPLT_sellers_org", key: "Code_Seller" },
  },
  IMPLT_route_org_accounts: {
    requiredFields: ["Code_Account"],
    existenceCheck: {
      table: "dbo.IMPLT_route_org_accounts",
      key: "Code_Account",
    },
  },
  IMPLT_Sales_Quota: {
    requiredFields: ["Code_Seller"],
    existenceCheck: {
      table: "dbo.IMPLT_Sales_Quota",
      key: "Code_Seller",
    },
  },
  IMPLT_warehouses_stock: {
    requiredFields: ["Code_Product", "Quantity"],
    existenceCheck: {
      table: "dbo.IMPLT_warehouses_stock",
      key: "Code_Product",
    },
  },
};

module.exports = validationRules;
