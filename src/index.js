import 'dotenv/config';
import {
  createConnection
} from "./config/DbConnection.js";
import {
  searchEmailUids,
  fetchBodiesByUids, 
  markEmailAsRead
} from './service/MailService.js';
import {
  processOrder
} from './service/OrderService.js';

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

    const {
      messages
    } = await fetchBodiesByUids({
      uids,
      mailbox: 'INBOX',
      markSeen: false 
    });
    console.log("messages: ", messages);

    if (messages.length > 0) {
      for (let i = 0; i < messages.length; i++) {
        console.log(`Procesando orden ${i + 1} de ${messages.length}:`, messages[i]);
        try {
          await processOrder(messages[i]);
          await markEmailAsRead(messages[i].uid);
        } catch (error) {
          console.error(`Error al insertar orden ${i + 1}:`, error);
        }
      }
    } else {}
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