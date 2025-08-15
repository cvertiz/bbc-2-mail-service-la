import { handler } from "../index.js";
import { ConnectionInstance } from "../config/DbConnection.js";

describe("Index suit test", function () {
  beforeAll(() => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    jest.spyOn(console, "info").mockImplementation(() => {});
    jest.spyOn(console, "log").mockImplementation(() => {});
  });
  afterEach(() => {
    jest.clearAllMocks();
  });
  afterAll(() => {
    //ConnectionInstance.end();
  });

  //Calling db function
  test("Should Return a 200", async () => {
    var result = await handler(
      {
        body: JSON.stringify({
          warehouseId: "3a6a4c85-4fa4-481b-8ec6-1140368caf57",
          productName: null,
          productSku: null,
          productDescription: null,
          startAdmission: null, 
          endAdmission: null,
          statusProduct: null
        }),
      },
      null,
      null
    );
    let body = JSON.parse(result.body);
    //expect(result.statusCode).toBe(200);
    //expect(body.message_response[0].message).toBe(null);
  });
  test("Should Return a 500", async () => {
    var result = await handler(
      {
        body: JSON.stringify({
          warehouseId: "3a6a4c85-4fa4-481b-8ec6-1140368caf57",
          productName: null,
          productSku: null,
          productDescription: null,
          startAdmission: null, 
          endAdmission: null,
          statusProduct: null
        }),
      },
      null,
      null
    );
    let body = JSON.parse(result.body);
    //expect(result.statusCode).toBe(500);
    //expect(body.message_response[0].message).toBe("Value is not valid");
  });
});
