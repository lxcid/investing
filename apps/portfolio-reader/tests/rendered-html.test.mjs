import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const appRoot = new URL("../", import.meta.url);

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the portfolio research reader", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Portfolio Research Reader<\/title>/i);
  assert.match(html, /Read the evidence/);
  assert.match(html, /Company library/);
  assert.match(html, /Raffles Medical Group Ltd/);
  assert.match(html, /Preserved sources/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/);
});

test("ships the generated repository projection and removes the disposable preview", async () => {
  const [data, page, packageJson] = await Promise.all([
    readFile(new URL("../app/data/repository.json", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  const payload = JSON.parse(data);
  assert.equal(payload.meta.title, "Portfolio Research Reader");
  assert.equal(payload.portfolio.mandate.status, "working");
  assert.equal(payload.companies.length, 1);
  assert.equal(payload.companies[0].metadata.ticker, "BSL");
  assert.equal(payload.companies[0].documents.length, 9);
  assert.equal(payload.companies[0].ownership.nodes.length, 16);
  assert.equal(payload.companies[0].ownership.edges.length, 19);
  assert.match(page, /PortfolioView/);
  assert.match(page, /CompanyView/);
  assert.match(page, /holding_component_id/);
  assert.match(packageJson, /"sync:data"/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  await assert.rejects(access(new URL("../app/_sites-preview", import.meta.url)));
  await assert.rejects(access(new URL("node_modules/react-loading-skeleton", appRoot)));
});
