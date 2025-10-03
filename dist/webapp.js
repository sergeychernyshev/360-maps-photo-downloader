"use strict";
var __importDefault =
  (this && this.__importDefault) ||
  function (mod) {
    return mod && mod.__esModule ? mod : { default: mod };
  };
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const express_session_1 = __importDefault(require("express-session"));
const path_1 = __importDefault(require("path"));
const fs_1 = require("fs");
const crypto_1 = __importDefault(require("crypto"));
const http_1 = __importDefault(require("http"));
const ws_1 = __importDefault(require("ws"));
const index_1 = __importDefault(require("./routes/index"));
const oauth_1 = require("./oauth");
const ws_handler_1 = require("./ws-handler");
const download_state_1 = require("./download-state");
const memorystore_1 = __importDefault(require("memorystore"));
// --- CONFIGURATION ---
const PORT = 3000;
const CREDENTIALS_PATH = path_1.default.join(process.cwd(), "credentials.json");
const TOKEN_PATH = path_1.default.join(process.cwd(), "token.json");
const CONFIG_PATH = path_1.default.join(process.cwd(), "config.json");
// --- WEB APP SETUP ---
const app = (0, express_1.default)();
const server = http_1.default.createServer(app);
const wss = new ws_1.default.Server({ noServer: true });
const sessionParser = (0, express_session_1.default)({
  store: new ((0, memorystore_1.default)(express_session_1.default))({
    checkPeriod: 86400000, // prune expired entries every 24h
  }),
  secret: crypto_1.default.randomBytes(32).toString("hex"),
  resave: false,
  saveUninitialized: false,
});
server.on("upgrade", function upgrade(request, socket, head) {
  sessionParser(request, {}, () => {
    wss.handleUpgrade(request, socket, head, function done(ws) {
      wss.emit("connection", ws, request);
    });
  });
});
wss.on("connection", (ws, req) => {
  console.log("Client connected for progress updates");
  (0, download_state_1.setSocket)(ws);
  ws.on("message", (message) => {
    (0, ws_handler_1.handleMessage)(req, ws, message);
  });
  ws.on("close", () => {
    console.log("Client disconnected");
    (0, download_state_1.setSocket)(null);
  });
});
// Set up EJS
app.set("view engine", "ejs");
app.set("views", path_1.default.join(__dirname, "views"));
/**
 * Initializes the web application.
 */
async function initialize() {
  let config = {};
  try {
    const configData = await fs_1.promises.readFile(CONFIG_PATH, "utf-8");
    config = JSON.parse(configData);
  } catch (error) {
    console.log("config.json not found, using default settings.");
  }
  app.use(sessionParser);
  if (config.save_token) {
    try {
      const tokenData = await fs_1.promises.readFile(TOKEN_PATH, "utf-8");
      const token = JSON.parse(tokenData);
      if (await (0, oauth_1.isTokenValid)(token)) {
        console.log("Valid token found, logging user in.");
        // Manually create a session for the user
        app.use((req, res, next) => {
          if (!req.session.tokens) {
            req.session.tokens = token;
          }
          next();
        });
      } else {
        console.log("Invalid token found, deleting.");
        await fs_1.promises.unlink(TOKEN_PATH);
      }
    } catch (error) {
      console.log("Token file not found, starting fresh.");
    }
  }
  // Middleware to save the token to disk if the config option is set
  app.use(async (req, res, next) => {
    let config = {};
    try {
      const configData = await fs_1.promises.readFile(CONFIG_PATH, "utf-8");
      config = JSON.parse(configData);
    } catch (error) {
      // ignore
    }
    if (config.save_token) {
      const oldTokens = req.session.tokens;
      res.on("finish", async () => {
        if (
          req.session &&
          req.session.tokens &&
          req.session.tokens !== oldTokens
        ) {
          await fs_1.promises.writeFile(
            TOKEN_PATH,
            JSON.stringify(req.session.tokens, null, 2),
          );
          console.log("Saved token to disk.");
        }
      });
    }
    next();
  });
  // --- WEB INTERFACE & ROUTES ---
  app.use(express_1.default.static(path_1.default.join(__dirname, "public")));
  app.use(
    "/modules/leaflet",
    express_1.default.static(
      path_1.default.join(process.cwd(), "node_modules/leaflet/dist"),
    ),
  );
  app.use(
    "/modules/leaflet.markercluster",
    express_1.default.static(
      path_1.default.join(
        process.cwd(),
        "node_modules/leaflet.markercluster/dist",
      ),
    ),
  );
  app.use("/", index_1.default);
  /**
   * Global error handler for the Express app.
   */
  app.use((err, req, res, next) => {
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
      await fs_1.promises.access(CREDENTIALS_PATH);
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
//# sourceMappingURL=webapp.js.map
