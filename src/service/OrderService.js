import ExcelJS from "exceljs";
import axios from "axios";
import {
    ConnectionInstance
} from "../config/DbConnection.js";
import {
    SQSClient,
    SendMessageCommand
} from "@aws-sdk/client-sqs";

const QET_DATA_INTEGRACION = `SELECT * from business.fn_get_settings_shop_premiun_outlet();`;

export async function getMarketplaceId() {
    let nIntent = 0;
    let nMaxIntent = 1;
    let isOkay = false;

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

            for (let i = 0; i < oResult.rows[0].headers_integrations.length; i++) {
                const oHeaderIntegration = oResult.rows[0].headers_integrations[i];
                oHeaders[oHeaderIntegration.key] = oHeaderIntegration.value.replace(
                    "[token]",
                    ""
                );
            }
            const marketplaceId =
                oResult.rows[0].integrations_settings.marketplace_id;

            return marketplaceId;
        } catch (error) {
            console.error("Error in push zalora", error);
        }
    } while (!isOkay && nIntent < nMaxIntent);
    return null;
}

async function getCountryData(country_code) {
    const queryStatement = `
    SELECT *
    FROM business.country c where c.country_name_iso2 = $1 ;
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

export async function processOrder(order) {
    const marketplaceId = await getMarketplaceId();
    const country_code = order.countryCode ?? null;
    const resultCountryData = await getCountryData(country_code);
    const country_name = resultCountryData ?
        resultCountryData.country_name_en :
        null;

    const oResultLocation = await getDataFromLocation(
        country_name,
        marketplaceId
    );
    const locationCardCode = oResultLocation ? oResultLocation.card_code : null;
    const locationVat = oResultLocation ? oResultLocation.vat : null;

    const currency = order.currency_iso_code;

    const exchange_currency_to_eur = await getExchangeRate("EUR", currency);
    const exchange_to_usd = await getExchangeRate("EUR", "USD");
    console.log("exchange_currency_to_eur: ", exchange_currency_to_eur);
    console.log("exchange_to_usd: ", exchange_to_usd);

    console.log("order.customer: ", order.customerName);
    console.log(
        "order.shippingAddress: ",
        order.shippingAddress
    );

    const salesOrderHeader = [
        order.order_id, //sales_order_code:
        `${order.customerName}`, //customer_name:
        order.date, //posting_date:
        null, //expiration_date:
        order.date, //order_date:
        order.shippingAddress, //ship_to_code:
        order.shippingAddress, //pay_to_code:
        order.order_id, //order_key:
        "P", //status_code:
        //order.createdAt,
        // marketplaceId, // market_place_id: "93a7822a-ae8d-4602-bb8a-6d7daa789387"
        order.order_id, //purchase_order_code:
        locationCardCode, //card_code
    ];

    console.log("SALES ORDER HEADER: ", salesOrderHeader);

    //     console.log("order.order_lines: ", order.order_lines);

    //TODO DESCOMENTAR PARA SKU REAL
    const order_sku = order.itemReference;
    // const order_sku = 'ABA4493';

    const product = await findProductSalesOrder(
        order_sku,
        marketplaceId
    );
    console.log("product: ", product);
    let salesOrderDetails = [];

    if (product && product.length > 0) {
        const oPriceTotal = Number(order.amount) || 0;

        const rateEur = Number(exchange_currency_to_eur) || 1; // evita div/0
        const rateUsd = Number(exchange_to_usd) || 1;

        const dPrice_EUR = +(oPriceTotal / rateEur).toFixed(2);
        const dPrice_ConvertUSD = +(dPrice_EUR * rateUsd).toFixed(2);

        console.log("Price_EUR:", dPrice_EUR);
        console.log("Price_USD:", dPrice_ConvertUSD);

        const warehouseCode = product[0].warehouse_id ?
            `'${product[0].warehouse_id}'` :
            'NULL'; // sin comillas => valor NULL en SQL

        const detailTuple =
            `(${product[0].product_id}, '${order_sku}', 1, ${dPrice_ConvertUSD}, ` +
            `'P', ${warehouseCode}, ${dPrice_EUR}, ${oPriceTotal}, ` +
            `'${order.currency_iso_code}', ${locationVat == null ? 'NULL' : locationVat})`;

        salesOrderDetails.push(detailTuple);
    }

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
        console.log("queryStatement: ", queryStatement);

        try {
            const result = await ConnectionInstance.query(queryStatement, [
                marketplaceId,
                ...salesOrderHeader,
            ]);
            console.log("marketplaceId: ", marketplaceId);
            console.log("salesOrderHeader: ", ...salesOrderHeader);
            console.log("result: ", result.rows[0]);

            const product = await findProductSalesOrder(
                order_sku,
                marketplaceId
            );
            console.log("product: ", product);

        } catch (error) {
            console.error("Error executing query", error);
            // Handle query execution errors
        }
    }
}