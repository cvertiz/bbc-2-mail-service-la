import { ApiException, ValidationException } from "../../model/Exceptions.js";
import {
  buildEmptyOkResponse,
  buildErrorResponse,
  buildOkResponse,
} from "../../utils/Utils.js";

describe("Utils test suit", () => {
  test("Should return OK with data", async () => {
    let response = buildOkResponse({ data: 1 });
    let body = JSON.parse(response.body);
    expect(response.statusCode).toBe(200);
    expect(body.data).toEqual({ data: 1 });
  });

  test("Should return OK", async () => {
    let response = buildEmptyOkResponse();
    expect(response.statusCode).toBe(200);
  });

  test("Should return ERROR", async () => {
    let response = buildErrorResponse(new Error("Error generic"));
    let body = JSON.parse(response.body);
    expect(response.statusCode).toBe(500);
    expect(body.message_response[0].status_code).toBe("ERROR");
    expect(body.message_response[0].message).toBe("Unexpected error");
  });

  test("should return Api Error", async () => {
    let response = buildErrorResponse(new ApiException("Error API"));
    let body = JSON.parse(response.body);
    expect(response.statusCode).toBe(500);
    expect(body.message_response[0].status_code).toBe("ERROR");
    expect(body.message_response[0].message).toBe("Error API");
  });

  test("should return Api Error", async () => {
    let response = buildErrorResponse(
      new ValidationException("Validation exception")
    );
    let body = JSON.parse(response.body);
    expect(response.statusCode).toBe(500);
    expect(body.message_response[0].status_code).toBe("INVALD_VALUE_ERROR");
    expect(body.message_response[0].message).toBe("Validation exception");
  });
});
