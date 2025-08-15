import { ConnectionInstance } from "../../config/DbConnection.js";
import { ApiException, ValidationException } from "../../model/Exceptions.js";
import { callValidationFunction } from "../../service/ExampleService.js";

jest.mock("../../config/DbConnection.js", () => ({
  ConnectionInstance: {
    query: jest.fn(),
  },
}));
describe("Example Suit Service", () => {
  beforeAll(() => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    jest.spyOn(console, "info").mockImplementation(() => {});
    jest.spyOn(console, "log").mockImplementation(() => {});
  });
  afterEach(() => {
    jest.clearAllMocks();
  });
  test("Should return Exception", async () => {
    ConnectionInstance.query.mockImplementation(() => {
      throw {
        code: "E0001",
      };
    });
    await expect(callValidationFunction(1)).rejects.toEqual(
      new ValidationException("Value is not valid")
    );
  });
  test("Should return Exception", async () => {
    ConnectionInstance.query.mockImplementation(() => {
      throw new Error("Generi Error");
    });
    await expect(callValidationFunction(1)).rejects.toEqual(
      new ApiException("Unexpected error validating value")
    );
  });
});
