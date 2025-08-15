// require('dotenv').config();
// const steps = require('./src/Steps');


// exports.handler = async (event) => {

//     /**CARGAR VARIABLES DE ENTORNO */

//     const AMBIENTE = process.env.AMBIENTE;

//     console.info("VARIABLES DE ENTORNO:");
//     console.info("AMBIENTE:" + AMBIENTE);



//     if (!event.body) {


//         const response = {
//             statusCode: 500,
//             headers: { 'Content-Type': 'application/json' },
//             body: '{"error":"No hay body"}',
//         };
//         return response;
//     } else {

//         steps.logging("AMBIENTE",AMBIENTE);
//         return {
//             headers: {
//                 'Content-Type': 'application/json'
//             },
//             statusCode: 200,
//             body: JSON.stringify({'Ambiente':  AMBIENTE})
//         };

//     }
// };

import {
    createConnection
} from "./config/DbConnection.js";
import {
    buildEmptyOkResponse,
    buildErrorResponse
} from "./utils/Utils.js";
export const handler = async (event, context, callback) => {
    try {
        await createConnection();

        // await processRequest();
        // await processRequestSecret();
        // await processBrandAlley();
        // await processBestSecret();
        console.log("Request processed successfully");
        return buildEmptyOkResponse();
    } catch (error) {
        console.log(error);
        return buildErrorResponse(error);
    }
};




/****** TEST LOCAL ******/


let resp = handler({
    "body": `{"nombre":"Juan","apellido":"Perez"}`
});



resp.then((data) => {
    console.info("Respuesta del Lambda:" + JSON.stringify(data));
});