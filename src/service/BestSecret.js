import ExcelJS from "exceljs";
import axios from "axios";
import { ConnectionInstance } from "../config/DbConnection.js";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";

export async function processBestSecret() {
  try {
    const marketplaceId = "c7fb6c77-55fd-4ee6-b747-ca3b4717fdbd";

    const datefin = currentDate();
    const dateinicio = currentDateMenos(5);

    const myHeaders = {
      Authorization: "f1e039b3-cb27-46b5-9098-aabcd516eb70",
      Accept: "application/json",
    };
    let endpoint = `https://bestsecret.mirakl.net/api/orders?paginate=false&start_date=${dateinicio}T00:00:00.000000Z&end_date=${datefin}T23:59:00.000000Z`;

    // let endpoint = `https://bestsecret.mirakl.net/api/orders?paginate=false&start_date=${dateinicio}T00:00:00.000000Z&end_date=${datefin}T23:59:00.000000Z&order_state_codes=WAITING_ACCEPTANCE,SHIPPING`;
    let orders = [];
    const oResulShopPremiunOutlet = await axios({
      url: endpoint,
      method: "GET",
      headers: myHeaders,
    });
    orders = orders.concat(oResulShopPremiunOutlet.data.orders);

    console.log("orders: ", orders);
    if (orders.length > 0) {
      for (let i = 0; i < orders.length; i++) {
        try {
          await processOrder(orders[i], marketplaceId);
        } catch (error) {
          console.error(`Error al insertar orden ${i + 1}:`, error);
        }
      }
    } else {
    }
  } catch (error) {
    console.error("Error in push zalora", error);
  }
}

async function processOrder(order, marketplaceId) {
  const currency = order.currency_iso_code;
  const exchange_currency_to_eur = await getExchangeRate("EUR", currency);
  const exchange_to_usd = await getExchangeRate("EUR", "USD");

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
    `${order.customer.firstname} ${order.customer.lastname}`, //customer_name:
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

      const product = await findProductSalesOrder(order_sku, marketplaceId);
      if (product.length > 0) {
        let tax =
          orderDetail.taxes.length === 0 ? 0 : orderDetail.taxes[0].amount;
        const oPriceTotal =
          orderDetail.price + tax - orderDetail.total_commission;

        const dPrice_EUR = oPriceTotal / exchange_currency_to_eur;
        const dPrice_ConvertUSD = dPrice_EUR * exchange_to_usd;
        let warehouseCode = null;
        if (product[0].warehouse_id) {
          warehouseCode = "'" + product[0].warehouse_id + "'";
        }

        detailItem = `(${product[0].product_id}, '${order_sku}','${order.order_lines[0].quantity}', ${dPrice_ConvertUSD}, 'P', ${warehouseCode}, ${dPrice_EUR}, ${oPriceTotal}, '${order.currency_iso_code}')`;
        console.log("detailItem: ", detailItem);
      }

      return detailItem;
    })
  );

  const filteredDetails = salesOrderDetails.filter(
    (element) => element !== null
  );

  if (filteredDetails.length > 0) {
    const detailsValues = filteredDetails.join(",");
    console.log("detailsValues", detailsValues);
    const queryStatement = `
            SELECT * FROM business.save_sales_order_full_v2(
                $1,
                ROW($2, $3, $4, $5, $6, $7, $8, $9, $10, $11)::business.Type_SalesOrder,
                ARRAY[${detailsValues}]::business.Type_SalesOrderDetail_currency[]
            );
        `;

    try {
      const result = await ConnectionInstance.query(queryStatement, [
        marketplaceId,
        ...salesOrderHeader,
      ]);

      // if (result.rows[0].save_sales_order_full == 1) {
      //   await Promise.all(
      //     order.order_lines.map(async (orderDetail) => {
      //       const processSku = orderDetail.offer_sku;
      //       const firstLetters = processSku.substring(0, 3);
      //       const lastNumbers = processSku.substring(processSku.length - 4);
      //       const productSku = `${firstLetters}${lastNumbers}`;
      //       console.log("final sku SQS: ", productSku);
      //       const order_sku = productSku;
      //       const product = await findProductSalesOrder(
      //         order_sku,
      //         marketplaceId
      //       );
      //       if (product.length > 0) {
      //         //   await callSQSMarketplace(product[0].product_id, marketplaceId);
      //       }
      //     })
      //   );
      // }
    } catch (error) {
      console.error("Error executing query", error);
      // Handle query execution errors
    }
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

    // await sqsClient.send(command);
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
