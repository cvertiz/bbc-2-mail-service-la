import ExcelJS from "exceljs";
import axios from "axios";
import { ConnectionInstance } from "../config/DbConnection.js";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";

const QET_DATA_INTEGRACION = `SELECT * from business.fn_get_settings_shop_premiun_outlet();`;
const QET_CONVERSION_USD_TO_EUR = `SELECT * from business.get_exchange_rate_value_from_to($1, $2);`;
const QET_CONVERSION_EUR_TO_USD = `SELECT * from business.get_exchange_rate_value_from_to($1, $2);`;

const skuList = [
  { sku: "AAY6853" },
  { sku: "AAY6950" },
  { sku: "AAZ3167" },
  { sku: "AAY6993" },
  { sku: "AAY6995" },
  { sku: "AAY6941" },
  { sku: "AAZ4206" },
  { sku: "AAY6971" },
  { sku: "AAY6919" },
]; // Lista de SKUs que quieres procesar

export async function processRequest() {
  let oOldRequest = null;
  let nIntent = 0;
  let nMaxIntent = 1;
  let isOkay = false;
  let oBufferFile = null;

  const oHeaders = {};

  do {
    try {
      nIntent++;
      const oResult = await ConnectionInstance.query(QET_DATA_INTEGRACION, []);

      if (
        oResult.rows[0].integrations_settings == null ||
        oResult.rows[0].headers_integrations == null
      ) {
        isOkay = true;
        break;
      }

      //const sToken = await getToken(oResult.rows[0].integrations_settings);

      for (let i = 0; i < oResult.rows[0].headers_integrations.length; i++) {
        const oHeaderIntegration = oResult.rows[0].headers_integrations[i];
        oHeaders[oHeaderIntegration.key] = oHeaderIntegration.value.replace(
          "[token]",
          ""
        );
      }
      const marketplaceId =
        oResult.rows[0].integrations_settings.marketplace_id;

      //oBufferFile = await getBufferFile(oResult);

      const datefin = currentDate();
      const dateinicio = currentDateMenos(3); //3 días

      console.log(dateinicio);

      const oResulShopPremiunOutlet = await axios({
        url: `${oResult.rows[0].integrations_settings.description}?paginate=false&start_date=${dateinicio}T00:00:00.000000Z&end_date=${datefin}T23:59:00.000000Z&order_state_codes=WAITING_ACCEPTANCE,SHIPPING`, //SE ENVIA EL SHOP ID DE SER NECESARIO.
        method: "GET",
        headers: oHeaders,
        //data: await getFile(oBufferFile)
      });
      const orders = oResulShopPremiunOutlet.data.orders;
      console.log("orders: ", orders);
      if (orders.length > 0) {
        for (let i = 0; i < orders.length; i++) {
          try {
            processOrder(orders[i], marketplaceId);
          } catch (error) {
            console.error(`Error al insertar orden ${i + 1}:`, error);
          }
        }
      } else {
      }
    } catch (error) {
      console.error("Error in push zalora", error);
    }
  } while (!isOkay && nIntent < nMaxIntent);

  return true;
}

async function processOrder(order, marketplaceId) {
  const country_code = order.customer?.shipping_address?.country_iso_code ?? null;
  const resultCountryData = await getCountryData(country_code);
  const country_name = resultCountryData
    ? resultCountryData.country_name_en
    : null;

  const oResultLocation = await getDataFromLocation(
    country_name,
    marketplaceId
  );
  const locationCardCode = oResultLocation ? oResultLocation.card_code : null;
  const locationVat = oResultLocation ? oResultLocation.vat : null;
  
  const currency = order.currency_iso_code;
  
  const exchange_currency_to_eur = await getExchangeRate("EUR", currency);
  const exchange_to_usd = await getExchangeRate("EUR", "USD");

  console.log("order.customer: ", order.customer);
  console.log(
    "order.customer.shipping_address: ",
    order.customer.shipping_address
  );

  const line_1 = `${order.customer?.shipping_address?.street_1 ?? ""} ${
    order.customer?.shipping_address?.street_2 ?? ""
  }`;
  const line_2 = `${order.customer?.shipping_address?.state ?? ""} ${
    order.customer?.shipping_address?.zip_code ?? ""
  } ${order.customer?.shipping_address?.city ?? ""}   ${
    order.customer?.shipping_address?.country_iso_code ?? ""
  }`;
  const line_3 = `${order.customer?.shipping_address?.phone ?? ""}`;

  const salesOrderHeader = [
    order.order_id, //sales_order_code:
    `${order.customer.billing_address.firstname} ${order.customer.billing_address.lastname}`, //customer_name:
    order.created_date, //posting_date:
    null, //expiration_date:
    order.created_date, //order_date:
    line_1 + " \r\n " + line_2 + " \r\n " + line_3, //ship_to_code:
    line_1 + " \r\n " + line_2 + " \r\n " + line_3, //pay_to_code:
    order.order_id, //order_key:
    "P", //status_code:
    //order.createdAt,
    // market_place_id: "93a7822a-ae8d-4602-bb8a-6d7daa789387"
    order.order_id, //purchase_order_code:
    locationCardCode, //card_code
  ];

  console.log("SALES ORDER HEADER: ", salesOrderHeader);

  console.log("order.order_lines: ", order.order_lines);

  const salesOrderDetails = await Promise.all(
    order.order_lines.map(async (orderDetail) => {
      const processSku = orderDetail.offer_sku;
      console.log("seller sku: ", processSku);
      const firstLetters = processSku.substring(0, 3);
      const lastNumbers = processSku.substring(processSku.length - 4);
      const productSku = `${firstLetters}${lastNumbers}`;
      console.log("final sku: ", productSku);
      let detailItem = null;

      const order_sku = productSku;

      const product = await findProductSalesOrder(
        order_sku, 
        marketplaceId
      );
      if (product.length > 0) {
        //console.log('currency: ', currency)
        //console.log('order.total_price: ', order.total_price)
        //console.log('exchange_currency_to_eur: ', exchange_currency_to_eur)
        //console.log('exchange_eur_to_usd: ', exchange_eur_to_usd)

        const oPriceTotal =
          orderDetail.price -
          orderDetail.commission_fee +
          orderDetail.shipping_price;

        const dPrice_EUR = oPriceTotal / exchange_currency_to_eur;
        const dPrice_ConvertUSD = dPrice_EUR * exchange_to_usd;

        //console.log('Price_EUR: ', dPrice_EUR)
        //console.log('Price_USD: ', dPrice_ConvertUSD)
        let warehouseCode = null;
        if (product[0].warehouse_id) {
          warehouseCode = "'" + product[0].warehouse_id + "'";
        }

        detailItem = `(${product[0].product_id}, '${order_sku}','${order.order_lines[0].quantity}', ${dPrice_ConvertUSD}, 'P', ${warehouseCode}, ${dPrice_EUR}, ${oPriceTotal}, '${order.currency_iso_code}', ${locationVat})`;
        console.log("detailItem: ", detailItem);
      }

      return detailItem;
    })
  );

  //console.log("detail items: ", salesOrderDetails);

  const filteredDetails = salesOrderDetails.filter(
    (element) => element !== null
  );

  if (filteredDetails.length > 0) {
    const detailsValues = filteredDetails.join(",");
    console.log("detailsValues", detailsValues);
    const queryStatement = `
            SELECT * FROM business.save_sales_order_full(
                $1,
                ROW($2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)::business.Type_SalesOrder_with_card,
                ARRAY[${detailsValues}]::business.Type_SalesOrderDetail_with_vat[]
            );
        `;

    try {
      const result = await ConnectionInstance.query(queryStatement, [
        marketplaceId,
        ...salesOrderHeader,
      ]);

      if (result.rows[0].save_sales_order_full == 1) {
        await Promise.all(
          order.order_lines.map(async (orderDetail) => {
            const processSku = orderDetail.offer_sku;
            const firstLetters = processSku.substring(0, 3);
            const lastNumbers = processSku.substring(processSku.length - 4);
            const productSku = `${firstLetters}${lastNumbers}`;
            console.log("final sku SQS: ", productSku);
            const order_sku = productSku;
            const product = await findProductSalesOrder(
              order_sku,
              marketplaceId
            );
            if (product.length > 0) {
              await callSQSMarketplace(product[0].product_id, marketplaceId);
            }
          })
        );
      }
    } catch (error) {
      console.error("Error executing query", error);
      // Handle query execution errors
    }
  }
}

async function getCountryData(country_code) {
  const queryStatement = `
    SELECT *
    FROM business.country c where c.country_name_iso3 =$1 ;
  `;

  try {
    const result = await ConnectionInstance.query(queryStatement, [
      country_code,
    ]);

    if (result.rows.length > 0) {
      return result.rows[0];
    } else {
      return null;
    }
  } catch (error) {
    console.error("Error calling validation function", error);
    return null;
  }
}

async function getDataFromLocation(country, marketplaceId) {
  const queryStatement = `
    SELECT *
    FROM business.locations l
    INNER JOIN business.marketplace_locations lm 
      ON l.location_code = lm.location_code 
    WHERE lm.marketplace_id = $1 
      AND l.country = $2
  `;

  try {
    const result = await ConnectionInstance.query(queryStatement, [
      marketplaceId,
      country,
    ]);

    if (result.rows.length > 0) {
      return result.rows[0];
    } else {
      return null;
    }
  } catch (error) {
    console.error("Error calling validation function", error);
    return null;
  }
}

const getExchangeRate = async (fromCurrency, toCurrency) => {
  //console.log(`from ${fromCurrency} to ${toCurrency}`)
  if (fromCurrency === toCurrency) {
    return 1;
  } else {
    const query = `
    SELECT exchange_rate_value
    FROM business.exchange_rate
    WHERE currency_code_from = $1
      AND currency_code_to = $2
      AND status_code = 'A';
  `;
    const result = await ConnectionInstance.query(query, [
      fromCurrency,
      toCurrency,
    ]);

    return result.rows[0].exchange_rate_value;
  }
};

function currentDate() {
  const currentDate = new Date();
  const año = currentDate.getFullYear();
  const mes = String(currentDate.getMonth() + 1).padStart(2, "0");
  const dia = String(currentDate.getDate()).padStart(2, "0");

  const processedDate = `${año}-${mes}-${dia}`;
  return processedDate;
}

function currentDateMenos(days) {
  const currentDate = new Date();
  const currentDateMenos = new Date(currentDate - days * 24 * 60 * 60 * 1000);

  const año = currentDateMenos.getFullYear();
  const mes = String(currentDateMenos.getMonth() + 1).padStart(2, "0");
  const dia = String(currentDateMenos.getDate()).padStart(2, "0");

  const processedDate = `${año}-${mes}-${dia}`;
  return processedDate;
}

async function findProductSalesOrder(sku, marketplaceId) {
  const queryStatement =
    "SELECT * FROM business.fn_find_product_sales_order_service_auto($1, $2)";
  const params = [sku, marketplaceId];

  try {
    const result = await ConnectionInstance.query(queryStatement, params);
    return formatResultSetFrom(result);
  } catch (error) {
    console.error("Error calling validation function", error);
    // Handle validation errors
  }
}

function formatResultSetFrom(resultSet) {
  return resultSet.rows.map((row) => row.data_set);
}

async function callSQSMarketplace(productId, marketplaceId) {
  let sqsClient = new SQSClient();

  let params = {
    MessageBody: JSON.stringify({
      product_id: productId,
      marketplace_id: marketplaceId,
    }),
    QueueUrl: process.env.SQSPULL, //'https://sqs.us-east-2.amazonaws.com/418334950001/bbc-pull-marketplaces-sqs'
  };

  try {
    console.log("Enviando SQS orquestador");
    let command = new SendMessageCommand(params);

    await sqsClient.send(command);
    console.log("SQS orquestador ejecutado");
  } catch (error) {
    console.error("Error calling validation function", error);
    //handleValidationErrors(error);
  }
}

async function getBufferFile(oResult) {
  const workbook = new ExcelJS.Workbook();

  workbook.creator = "BBC";
  workbook.lastModifiedBy = "BBC";
  workbook.created = new Date();
  workbook.modified = new Date();
  const sheet = workbook.addWorksheet("file");

  sheet.columns = JSON.parse(
    oResult.rows[0].integrations_settings.body
  ).bodyCsv;

  let sBodyJson = JSON.stringify(
    JSON.parse(oResult.rows[0].integrations_settings.body).bodyStructure
  );

  for (const key in oResult.rows[0].generic_push_detail) {
    sBodyJson = sBodyJson.replace(
      new RegExp(`\\[${key}\\]`, "g"),
      oResult.rows[0].generic_push_detail[key]
    );
  }

  sheet.addRow(JSON.parse(sBodyJson));

  return await workbook.csv.writeBuffer();
}

async function getFile(oBuffer) {
  const oForm = new FormData();

  oForm.append("file1", new Blob([oBuffer]), "file.csv");
  oForm.append("type", "text/csv");

  return oForm;
}
