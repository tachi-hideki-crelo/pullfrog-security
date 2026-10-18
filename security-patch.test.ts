import { createServer } from "node:http";
import { createRequire } from "node:module";
import { connect } from "node:net";
import { once } from "node:events";
import { decode, encode } from "@toon-format/toon";
import { afterEach, describe, expect, it, vi } from "vitest";
import { handleToolSuccess } from "./mcp/shared.ts";
import pkg from "./package.json" with { type: "json" };

const require = createRequire(import.meta.url);
const coreRequire = createRequire(require.resolve("@actions/core"));
const clientRequire = createRequire(coreRequire.resolve("@actions/http-client"));
const { HttpClient } = coreRequire("@actions/http-client");
const { request } = clientRequire("undici");

afterEach(() => vi.unstubAllEnvs());

describe("Crelo security dependency patch", () => {
  it("resolves the reviewed dependency versions, not the vulnerable graph", () => {
    expect(pkg.devDependencies["@toon-format/toon"]).toBe("2.3.1");
    expect(pkg.pnpm.overrides["@actions/http-client>undici"]).toBe("6.28.1");
    expect(clientRequire("undici/package.json").version).toBe("6.28.1");
    expect(() => clientRequire.resolve("@fastify/busboy")).toThrow();
  });

  it("keeps MCP tool output and nested PR data serializable", () => {
    const data = {
      title: "PR review / レビュー",
      changed_files: [{ path: "app/page.tsx", additions: 3, deletions: 1 }],
      approved: false,
      optional: null,
    };
    const result = handleToolSuccess(data);
    expect(result.content).toHaveLength(1);
    expect(decode(result.content[0].text)).toEqual(data);
  });

  it("preserves own prototype-like keys without polluting any prototype", () => {
    const untrusted = JSON.parse(
      '{"__proto__":{"creloPolluted":true},"constructor":{"prototype":{"creloPolluted":true}},"title":"review"}'
    );
    const decoded = decode(encode(untrusted)) as Record<string, unknown>;
    expect(Object.hasOwn(decoded, "__proto__")).toBe(true);
    expect(Object.getPrototypeOf(decoded)).toBe(Object.prototype);
    expect(({} as Record<string, unknown>).creloPolluted).toBeUndefined();
    expect(decoded).toEqual(untrusted);
  });

  it("keeps GitHub toolkit HTTP JSON requests working", async () => {
    for (const name of ["http_proxy", "HTTP_PROXY", "https_proxy", "HTTPS_PROXY"]) {
      vi.stubEnv(name, "");
    }
    const server = createServer((_req, res) => {
      res.setHeader("content-type", "application/json");
      res.end('{"synthetic":true}');
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("expected TCP address");
    const client = new HttpClient("crelo-security-test");
    try {
      const result = await client.getJson(`http://127.0.0.1:${address.port}/fixture`);
      expect(result.statusCode).toBe(200);
      expect(result.result).toEqual({ synthetic: true });
    } finally {
      client.dispose();
      server.close();
      await once(server, "close");
    }
  });

  it("keeps the toolkit's Undici proxy dispatcher compatible", async () => {
    const origin = createServer((_req, res) => res.end("synthetic proxy response"));
    origin.listen(0, "127.0.0.1");
    await once(origin, "listening");
    const originAddress = origin.address();
    if (!originAddress || typeof originAddress === "string") throw new Error("expected TCP address");
    const originPort = originAddress.port;
    const proxy = createServer();
    let tunnelRequests = 0;
    proxy.on("connect", (req, socket, head) => {
      // A local-only proxy fixture must not become a general network tunnel.
      if (req.url !== `crelo-fixture.invalid:${originPort}`) {
        socket.end("HTTP/1.1 403 Forbidden\r\n\r\n");
        return;
      }
      tunnelRequests++;
      const upstream = connect(originPort, "127.0.0.1", () => {
        socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
        if (head.length) upstream.write(head);
        socket.pipe(upstream);
        upstream.pipe(socket);
      });
      upstream.on("error", () => socket.destroy());
      socket.on("error", () => upstream.destroy());
      socket.on("close", () => upstream.destroy());
    });
    proxy.listen(0, "127.0.0.1");
    await once(proxy, "listening");
    const proxyAddress = proxy.address();
    if (!proxyAddress || typeof proxyAddress === "string") throw new Error("expected TCP address");
    vi.stubEnv("http_proxy", `http://127.0.0.1:${proxyAddress.port}`);
    vi.stubEnv("HTTP_PROXY", "");
    vi.stubEnv("no_proxy", "");
    vi.stubEnv("NO_PROXY", "");
    // The toolkit intentionally bypasses proxies for loopback hostnames.
    // The .invalid hostname is resolved only by our local proxy fixture.
    const url = `http://crelo-fixture.invalid:${originPort}/fixture`;
    const client = new HttpClient("crelo-security-test");
    const dispatcher = client.getAgentDispatcher(url);
    try {
      expect(dispatcher).toBeDefined();
      const response = await request(url, { dispatcher, headersTimeout: 2000, bodyTimeout: 2000 });
      expect(response.statusCode).toBe(200);
      expect(await response.body.text()).toBe("synthetic proxy response");
      expect(tunnelRequests).toBe(1);
    } finally {
      await dispatcher?.close();
      client.dispose();
      proxy.close();
      origin.close();
      await Promise.all([once(proxy, "close"), once(origin, "close")]);
    }
  });
});
