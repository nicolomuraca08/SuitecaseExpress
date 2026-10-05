import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  const contactRateLimit = new Map<string, number>();
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  app.post("/api/recaptcha/verify", async (req, res) => {
    const secret = process.env.RECAPTCHA_SECRET_KEY;
    const token = typeof req.body?.token === "string" ? req.body.token : "";
    if (!secret) return res.status(503).json({ ok: false, message: "reCAPTCHA non configurato." });
    if (!token) return res.status(400).json({ ok: false, message: "Token reCAPTCHA mancante." });
    const clientKey = req.ip || req.socket.remoteAddress || "unknown";
    const lastRequest = contactRateLimit.get(clientKey) ?? 0;
    if (Date.now() - lastRequest < 60_000) return res.status(429).json({ ok: false, message: "Attendi un minuto prima di inviare un’altra richiesta." });
    try {
      const verification = await fetch("https://www.google.com/recaptcha/api/siteverify", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ secret, response: token }),
      });
      const result = await verification.json() as { success?: boolean; score?: number; action?: string };
      if (!verification.ok || !result.success || (result.score ?? 0) < 0.5 || result.action !== "contact_submit") return res.status(403).json({ ok: false, message: "Verifica anti-spam non superata." });
      contactRateLimit.set(clientKey, Date.now());
      return res.json({ ok: true });
    } catch {
      return res.status(502).json({ ok: false, message: "Verifica anti-spam non disponibile." });
    }
  });
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
