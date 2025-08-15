import 'dotenv/config'; 
import { createConnection } from "./config/DbConnection.js";
import { processBestSecret } from "./service/BestSecret.js";
import { processBrandAlley } from "./service/BrandAlley.js";
import { processRequest } from "./service/BusinessService.js";
import { processRequestSecret } from "./service/SecretSales.js";
import { buildEmptyOkResponse, buildErrorResponse } from "./utils/Utils.js";
import { listEmails } from "./service/MailService.js";

export const handler = async (event, context, callback) => {
  try {
    await createConnection();

    const result = await listEmails({
      mailbox: 'INBOX',
      limit: 10,
      markSeen: false,
      filters: {},
    });

    return {
      statusCode: 200,
      body: JSON.stringify(result, null, 2)
    };
    
    return buildEmptyOkResponse();
  } catch (error) {
    console.log(error);
    return buildErrorResponse(error);
  }
};

(async () => {
  await handler(null, null, null);
})();

// let resp = handler({
//   "body": `{"nombre":"Juan","apellido":"Perez"}`
// });



// resp.then((data) => {
//   console.info("Respuesta del Lambda:" + JSON.stringify(data));
// });