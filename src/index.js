import 'dotenv/config';
import {
  createConnection
} from "./config/DbConnection.js";
import {
  searchEmailUids,
  fetchBodiesByUids
} from './service/MailService.js';

import {
  buildEmptyOkResponse,
  buildErrorResponse
} from "./utils/Utils.js";

export const handler = async (event, context, callback) => {
  try {
    await createConnection();

    const {
      uids
    } = await searchEmailUids({
      mailbox: 'INBOX',
      limit: 10,
      markSeen: false,
      filters: {
        from: process.env.FILTER_FROM || '',
        subject: process.env.FILTER_SUBJECT || '', // LIKE %Your Item Has Sold!
        unseen: true
      },
    });

    // 2) Con esos UIDs, trae cada body
    const {
      messages
    } = await fetchBodiesByUids({
      uids,
      mailbox: 'INBOX',
      markSeen: false // no los marques como leídos
    });
    console.log("messages: ", messages);
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