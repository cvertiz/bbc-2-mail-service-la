import { ApiException, ValidationException } from "../model/Exceptions.js";
import { BbcReponseApi, MessageResponse } from "../model/Response.js";

export function buildEmptyOkResponse() {
  let messageResponse = new MessageResponse("OK", null);
  let response = new BbcReponseApi(null, [messageResponse]);
  return {
    statusCode: 200,
    body: JSON.stringify(response),
  };
}

export function buildOkResponse(data) {
  let messageResponse = new MessageResponse("OK", null);
  let response = new BbcReponseApi(data, [messageResponse]);
  return {
    statusCode: 200,
    body: JSON.stringify(response),
  };
}

export function buildErrorResponse(error) {
  let code = "ERROR";
  let message = "Unexpected error";
  if (error instanceof ApiException || error instanceof ValidationException) {
    code = error.code;
    message = error.message;
  }

  let messageResponse = new MessageResponse(code, message);
  let response = new BbcReponseApi(null, [messageResponse]);
  return {
    statusCode: 500,
    body: JSON.stringify(response),
  };
}
