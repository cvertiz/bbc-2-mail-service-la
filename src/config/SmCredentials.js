import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";
import { ApiException } from "../model/Exceptions.js";

export async function getSecretManagerSecret(secretName) {
  try {
    const secretsManagerClient = new SecretsManagerClient();
    const command = new GetSecretValueCommand({ SecretId: secretName });
    const response = await secretsManagerClient.send(command);
    const secretString = response.SecretString;
    const rdsSecrets = JSON.parse(secretString);
    return rdsSecrets;
  } catch (error) {
    console.error("Error getting information of SM", error);
    throw new ApiException("Internal Error");
  }
}