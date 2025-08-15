export class BbcReponseApi {
  constructor(data, message_response) {
    this.data = data;
    this.message_response = message_response;
  }
}

export class MessageResponse {
  constructor(status_code, message) {
    this.status_code = status_code;
    this.message = message;
  }
}
