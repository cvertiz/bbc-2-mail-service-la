export class ApiException extends Error {
  constructor(message) {
    super(message);
    this.code = "ERROR";
  }
}
export class ValidationException extends Error {
  constructor(message) {
    super(message);
    this.code = "INVALD_VALUE_ERROR";
  }
}
