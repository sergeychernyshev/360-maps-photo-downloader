import { google } from "googleapis";
import { promises as fs } from "fs";
import path from "path";
import { Request } from "express";
import { Credentials, OAuth2Client } from "google-auth-library";

/**
 * The path to the credentials file.
 * @type {string}
 */
const CREDENTIALS_PATH = path.join(process.cwd(), "credentials.json");
/**
 * The path to the token file.
 * @type {string}
 */
const TOKEN_PATH = path.join(process.cwd(), "token.json");
/**
 * The path to the config file.
 * @type {string}
 */
const CONFIG_PATH = path.join(process.cwd(), "config.json");

/**
 * Creates a new OAuth2 client.
 * @returns {Promise<object>} A promise that resolves with the OAuth2 client.
 */
export async function getOAuthClient(): Promise<OAuth2Client> {
  const credsContent = await fs.readFile(CREDENTIALS_PATH, "utf-8");
  const { client_secret, client_id, redirect_uris } =
    JSON.parse(credsContent).web;
  return new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
}

/**
 * Gets an authenticated OAuth2 client.
 * @param {object} req - The Express request object, containing the session.
 * @returns {Promise<object>} A promise that resolves with the authenticated OAuth2 client.
 */
export async function getAuthenticatedClient(
  req: Request,
): Promise<OAuth2Client> {
  const oAuth2Client = await getOAuthClient();
  let tokens = (req.session as any).tokens;

  if (!tokens) {
    let config: { save_token?: boolean } = {};
    try {
      const configData = await fs.readFile(CONFIG_PATH, "utf-8");
      config = JSON.parse(configData);
    } catch (error) {
      /* ignore */
    }

    if (config.save_token) {
      try {
        const tokenData = await fs.readFile(TOKEN_PATH, "utf-8");
        tokens = JSON.parse(tokenData);
        (req.session as any).tokens = tokens;
        console.log("Loaded token from disk into session.");
      } catch (error) {
        /* ignore */
      }
    }
  }

  if (tokens) {
    oAuth2Client.setCredentials(tokens);
  } else {
    throw new Error("User is not authenticated.");
  }

  return oAuth2Client;
}

/**
 * Checks if the user is logged in.
 * @param {object} req - The Express request object, containing the session.
 * @returns {boolean} True if the user is logged in, false otherwise.
 */
export function isLoggedIn(req: Request): boolean {
  return req.session && (req.session as any).tokens;
}

/**
 * Logs the user in by exchanging an authorization code for an access token.
 * @param {object} req - The Express request object, containing the session.
 * @param {string} code - The authorization code.
 * @returns {Promise<void>}
 */
export async function login(req: Request, code: string): Promise<void> {
  const oAuth2Client = await getOAuthClient();
  const { tokens } = await oAuth2Client.getToken(code);
  (req.session as any).tokens = tokens;

  const configData = await fs.readFile(CONFIG_PATH, "utf-8").catch(() => "{}");
  const config = JSON.parse(configData);
  if (config.save_token) {
    await fs.writeFile(TOKEN_PATH, JSON.stringify(tokens, null, 2));
    console.log("Saved token to disk.");
  }
}

/**
 * Logs the user out by destroying the session and deleting the token file.
 * @param {object} req - The Express request object, containing the session.
 * @param {function} callback - A callback function to call after the user is logged out.
 */
export function logout(req: Request, callback: () => void): void {
  req.session.destroy(async (err: any) => {
    await fs.unlink(TOKEN_PATH).catch((err: any) => {
      if (err.code !== "ENOENT") {
        console.error("Error deleting token file:", err);
      }
    });
    console.log("Deleted token from disk.");
    callback();
  });
}

/**
 * Checks if an access token is valid.
 * @param {object} token - The access token to check.
 * @returns {Promise<boolean>} A promise that resolves with true if the token is valid, false otherwise.
 */
export async function isTokenValid(token: Credentials): Promise<boolean> {
  if (!token) {
    return false;
  }
  try {
    const oAuth2Client = await getOAuthClient();
    oAuth2Client.setCredentials(token);
    // Make a simple API call to check if the token is valid.
    if (!token.access_token) return false;
    const tokenInfo = await oAuth2Client.getTokenInfo(token.access_token);
    return !!tokenInfo;
  } catch (error) {
    return false;
  }
}
