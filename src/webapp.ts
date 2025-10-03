import express, { Request, Response, NextFunction } from "express";
import session from "express-session";
import path from "path";
import { promises as fs } from "fs";
import crypto from "crypto";
import http from "http";
import WebSocket from "ws";
import indexRouter from "./routes/index";
import { isTokenValid } from "./oauth";
import { handleMessage } from "./ws-handler";
import { setSocket } from "./download-state";
import MemoryStore from "memorystore";

// --- CONFIGURATION ---
const PORT = 3000;
const CREDENTIALS_PATH = path.join(process.cwd(), "credentials.json");
const TOKEN_PATH = path.join(process.cwd(), "token.json");
const CONFIG_PATH = path.join(process.cwd(), "config.json");

// --- WEB APP SETUP ---
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ noServer: true });

const sessionParser = session({
  store: new (MemoryStore(session))({
    checkPeriod: 86400000, // prune expired entries every 24h
  }),
  secret: crypto.randomBytes(32).toString("hex"),
  resave: false,
  saveUninitialized: false,
});

server.on(
  "upgrade",
  function upgrade(request: http.IncomingMessage, socket: any, head: Buffer) {
    sessionParser(request as Request, {} as Response, () => {
      wss.handleUpgrade(request, socket, head, function done(ws) {
        wss.emit("connection", ws, request);
      });
    });
  },
);

wss.on("connection", (ws: WebSocket, req: http.IncomingMessage) => {
  console.log("Client connected for progress updates");
  setSocket(ws);
  ws.on("message", (message: string) => {
    handleMessage(req as Request, ws, message);
  });
  ws.on("close", () => {
    console.log("Client disconnected");
    setSocket(null as any);
  });
});

// Set up EJS
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

/**
 * Initializes the web application.
 */
async function initialize() {
  let config: { save_token?: boolean } = {};
  try {
    const configData = await fs.readFile(CONFIG_PATH, "utf-8");
    config = JSON.parse(configData);
  } catch (error) {
    console.log("config.json not found, using default settings.");
  }

  app.use(sessionParser);

  if (config.save_token) {
    try {
      const tokenData = await fs.readFile(TOKEN_PATH, "utf-8");
      const token = JSON.parse(tokenData);
      if (await isTokenValid(token)) {
        console.log("Valid token found, logging user in.");
        // Manually create a session for the user
        app.use((req: Request, res: Response, next: NextFunction) => {
          if (!(req.session as any).tokens) {
            (req.session as any).tokens = token;
          }
          next();
        });
      } else {
        console.log("Invalid token found, deleting.");
        await fs.unlink(TOKEN_PATH);
      }
    } catch (error) {
      console.log("Token file not found, starting fresh.");
    }
  }

  // Middleware to save the token to disk if the config option is set
  app.use(async (req: Request, res: Response, next: NextFunction) => {
    let config: { save_token?: boolean } = {};
    try {
      const configData = await fs.readFile(CONFIG_PATH, "utf-8");
      config = JSON.parse(configData);
    } catch (error) {
      // ignore
    }

    if (config.save_token) {
      const oldTokens = (req.session as any).tokens;
      res.on("finish", async () => {
        if (
          req.session &&
          (req.session as any).tokens &&
          (req.session as any).tokens !== oldTokens
        ) {
          await fs.writeFile(
            TOKEN_PATH,
            JSON.stringify((req.session as any).tokens, null, 2),
          );
          console.log("Saved token to disk.");
        }
      });
    }
    next();
  });

  // --- WEB INTERFACE & ROUTES ---
  app.use(express.static(path.join(__dirname, "public")));
  app.use(
    "/modules/leaflet",
    express.static(path.join(process.cwd(), "node_modules/leaflet/dist")),
  );
  app.use(
    "/modules/leaflet.markercluster",
    express.static(
      path.join(process.cwd(), "node_modules/leaflet.markercluster/dist"),
    ),
  );
  app.use("/", indexRouter);

  /**
   * Global error handler for the Express app.
   */
  app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    if (err.message === "User is not authenticated.") {
      req.session.destroy(() => {
        res.redirect("/login");
      });
    } else {
      console.error(err.stack);
      res.status(500).send(`Something broke! <pre>${err.stack}</pre>`);
    }
  });

  /**
   * Starts the web server.
   */
  async function startServer() {
    try {
      // Check if credentials file exists before starting
      await fs.access(CREDENTIALS_PATH);
      server.listen(PORT, () => {
        console.log(`\n✅ Server running at http://localhost:${PORT}`);
        console.log("   Open this URL in your browser to start.");
      });
    } catch (error) {
      console.error("❌ FATAL ERROR: `credentials.json` not found.");
      console.error(
        "   Please ensure the credentials file from Google Cloud is in the project directory.",
      );
      process.exit(1);
    }
  }
  startServer();
}

initialize();
export {};
