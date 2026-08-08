import { createServer, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".map": "application/json",
};

export type StaticServer = {
  url: string;
  close: () => Promise<void>;
};

/** Serve a directory tree over HTTP for Playwright page.goto. */
export async function startStaticServer(rootDir: string): Promise<StaticServer> {
  const root = resolve(rootDir);
  const server: Server = createServer(async (req, res) => {
    try {
      const rawPath = decodeURIComponent((req.url ?? "/").split("?")[0] ?? "/");
      const relative = rawPath === "/" ? "/index.html" : rawPath;
      const filePath = normalize(join(root, relative));
      if (!filePath.startsWith(root)) {
        res.writeHead(403).end("Forbidden");
        return;
      }
      const body = await readFile(filePath);
      const type = MIME[extname(filePath)] ?? "application/octet-stream";
      res.writeHead(200, { "Content-Type": type }).end(body);
    } catch {
      res.writeHead(404).end("Not found");
    }
  });

  const listenHost = process.env.DOCS_IMAGES_HOST ?? "127.0.0.1";
  const port = Number(process.env.DOCS_IMAGES_PORT ?? "0");

  await new Promise<void>((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(port, listenHost, () => resolveListen());
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to bind static server");
  }

  // 0.0.0.0 is listen-only; clients should use loopback.
  const clientHost =
    listenHost === "0.0.0.0" || listenHost === "::"
      ? "127.0.0.1"
      : listenHost;

  return {
    url: `http://${clientHost}:${address.port}`,
    close: () =>
      new Promise((resolveClose, reject) => {
        server.close((error) => (error ? reject(error) : resolveClose()));
      }),
  };
}
