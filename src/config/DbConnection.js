import pg from "pg";
import { ApiException } from "../model/Exceptions.js";
import { getSecretManagerSecret } from "./SmCredentials.js";

export let ConnectionInstance = null;

export async function createConnection() {
  try {
    if (ConnectionInstance == null) {
      // let secretManagerName = process.env.SMSECRET ;//"rds-db-secrets"
      // let dbName = process.env.PGDB;//"bbc_db_dev"
      // let secretManager = await getSecretManagerSecret(secretManagerName);
      // let client = new pg.Client({
      //   host: secretManager.host,
      //   port: 5432,
      //   database: dbName,
      //   user: secretManager.username,
      //   password: secretManager.password,
      //   ssl: {
      //     rejectUnauthorized: false,
      //   },
      // });
      let client = new pg.Client({
        host:
          process.env.DB_HOST ||
          "rds-prd-eu.creymue0st6l.eu-west-1.rds.amazonaws.com",
          port: Number(process.env.DB_PORT) || 5432,
          user: process.env.DB_USER || "masterbbc",
          password: process.env.DB_PASSWORD || "Gr0wb1zPRDM39kdu4",
          database: process.env.DB_NAME || "bbc_tp_qa",
          ssl: {
            rejectUnauthorized: false
          },
      });
      await client.connect();
      ConnectionInstance = client;
    }
    return ConnectionInstance;
  } catch (error) {
    console.error("Error creating db connection", error);
    throw new ApiException("Internal Error");
  }
}