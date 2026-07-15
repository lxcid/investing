import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(appRoot, "../..");
const vaultRoot = path.join(repoRoot, "vault");
const portfolioRoot = path.join(vaultRoot, "portfolio");
const companiesRoot = path.join(vaultRoot, "companies");
const generatedRoot = path.join(appRoot, "public", "research-data");
const temporaryRoot = path.join(appRoot, "public", `.research-data-${process.pid}`);

function coerce(value) {
  if (value === "") return null;
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^-?\d+(?:\.\d+)?$/.test(value)) return Number(value);
  return value;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const next = text[index + 1];

    if (character === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && next === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }

  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }

  const [headers = [], ...values] = rows;
  return values.map((cells) =>
    Object.fromEntries(
      headers.map((header, index) => [header, coerce(cells[index] ?? "")]),
    ),
  );
}

function parseFrontmatter(text) {
  if (!text.startsWith("---\n")) return { attributes: {}, body: text };
  const boundary = text.indexOf("\n---\n", 4);
  if (boundary === -1) return { attributes: {}, body: text };

  const attributes = {};
  const lines = text.slice(4, boundary).split("\n");
  let activeList = null;

  for (const line of lines) {
    const listItem = line.match(/^\s+-\s+(.+)$/);
    if (listItem && activeList) {
      attributes[activeList].push(coerce(listItem[1].trim()));
      continue;
    }

    const pair = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!pair) continue;
    const [, key, rawValue] = pair;
    if (rawValue === "") {
      attributes[key] = [];
      activeList = key;
    } else {
      attributes[key] = coerce(rawValue.replace(/^['"]|['"]$/g, ""));
      activeList = null;
    }
  }

  return { attributes, body: text.slice(boundary + 5).trim() };
}

function titleFromMarkdown(body, fallback) {
  return body.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? fallback;
}

function summarizeMarkdown(body) {
  const paragraphs = body
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .split(/\n\s*\n/)
    .map((paragraph) =>
      paragraph
        .replace(/^#+\s+/gm, "")
        .replace(/^>\s?(?:\[![^\]]+\]\s*)?/gm, "")
        .replace(/^[-*]\s+/gm, "")
        .replace(/\*\*/g, "")
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter((paragraph) => paragraph.length > 60 && !paragraph.startsWith("|"));
  const summary = paragraphs[0] ?? "No narrative summary is available yet.";
  return summary.length > 260 ? `${summary.slice(0, 257)}…` : summary;
}

function documentKind(relativePath) {
  if (relativePath === "index.md") return "Company overview";
  if (relativePath.startsWith("analysis/")) return "Analysis";
  if (relativePath.startsWith("ownership/")) return "Ownership";
  if (relativePath === "sources.md") return "Evidence register";
  if (["thesis.md", "valuation.md", "scorecard.md"].includes(relativePath)) {
    return "Decision research";
  }
  return "Research note";
}

async function walk(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolutePath = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(absolutePath)));
    else if (entry.isFile()) files.push(absolutePath);
  }
  return files;
}

async function readCsv(absolutePath) {
  return parseCsv(await readFile(absolutePath, "utf8"));
}

async function readJsonFiles(root) {
  try {
    const files = (await walk(root)).filter((file) => file.endsWith(".json"));
    return await Promise.all(
      files.map(async (file) => ({
        path: path.relative(repoRoot, file),
        data: JSON.parse(await readFile(file, "utf8")),
      })),
    );
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function readOwnership(companyRoot) {
  const ownershipRoot = path.join(companyRoot, "ownership");
  try {
    const [nodes, edges, components, events, groups, reportedInterests, signals, groupSeries] =
      await Promise.all([
        readCsv(path.join(ownershipRoot, "nodes.csv")),
        readCsv(path.join(ownershipRoot, "edges.csv")),
        readCsv(path.join(ownershipRoot, "component-observations.csv")),
        readCsv(path.join(ownershipRoot, "disclosure-events.csv")),
        readCsv(path.join(ownershipRoot, "groups.csv")),
        readCsv(path.join(ownershipRoot, "reported-interests.csv")),
        readCsv(path.join(ownershipRoot, "signals.csv")),
        readCsv(path.join(ownershipRoot, "group-series.csv")),
      ]);

    return {
      nodes,
      edges,
      components,
      events,
      groups,
      reportedInterests,
      signals,
      groupSeries,
    };
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function readCompany(exchange, directory) {
  const companyRoot = path.join(companiesRoot, exchange, directory);
  const companyPath = path.relative(repoRoot, companyRoot);
  const indexText = await readFile(path.join(companyRoot, "index.md"), "utf8");
  const index = parseFrontmatter(indexText);
  const allFiles = await walk(companyRoot);
  const markdownFiles = allFiles.filter(
    (file) => file.endsWith(".md") && !file.includes(`${path.sep}sources${path.sep}`),
  );
  const documents = await Promise.all(
    markdownFiles.map(async (file) => {
      const text = await readFile(file, "utf8");
      const parsed = parseFrontmatter(text);
      const relativePath = path.relative(companyRoot, file);
      return {
        id: `${exchange}-${directory}-${relativePath}`.replace(/[^A-Za-z0-9_-]+/g, "-"),
        path: `${companyPath}/${relativePath}`,
        relativePath,
        kind: documentKind(relativePath),
        title: titleFromMarkdown(parsed.body, path.basename(file, ".md")),
        summary: summarizeMarkdown(parsed.body),
        attributes: parsed.attributes,
        body: parsed.body,
      };
    }),
  );

  documents.sort((left, right) => {
    const order = [
      "index.md",
      "analysis/",
      "thesis.md",
      "valuation.md",
      "scorecard.md",
      "questions.md",
      "timeline.md",
      "ownership/",
      "sources.md",
    ];
    const rank = (value) => {
      const found = order.findIndex((prefix) => value.startsWith(prefix));
      return found === -1 ? order.length : found;
    };
    return rank(left.relativePath) - rank(right.relativePath) || left.title.localeCompare(right.title);
  });

  const sourceFiles = await Promise.all(
    allFiles
      .filter((file) => file.includes(`${path.sep}sources${path.sep}`))
      .map(async (file) => {
        const fileStat = await stat(file);
        const relativePath = path.relative(companyRoot, file);
        const [, category = "other"] = relativePath.split(path.sep);
        return {
          path: `${companyPath}/${relativePath}`,
          name: path.basename(file),
          category,
          extension: path.extname(file).slice(1).toUpperCase() || "FILE",
          sizeBytes: fileStat.size,
        };
      }),
  );

  const marketData = await readJsonFiles(path.join(companyRoot, "market-data"));
  const financials = await readJsonFiles(path.join(companyRoot, "financials"));
  const price = marketData
    .map((entry) => entry.data)
    .filter((entry) => typeof entry.price === "number")
    .sort((left, right) => String(right.as_of).localeCompare(String(left.as_of)))[0] ?? null;
  const latestFinancials = financials
    .map((entry) => entry.data)
    .sort((left, right) => String(right.period_end).localeCompare(String(left.period_end)))[0] ?? null;

  return {
    path: companyPath,
    metadata: index.attributes,
    summary: summarizeMarkdown(index.body),
    documents,
    sources: sourceFiles.sort((left, right) => left.path.localeCompare(right.path)),
    price,
    financials: latestFinancials,
    ownership: await readOwnership(companyRoot),
  };
}

async function readCompanies() {
  const exchanges = (await readdir(companiesRoot, { withFileTypes: true })).filter((entry) =>
    entry.isDirectory(),
  );
  const companies = [];
  for (const exchange of exchanges) {
    const directories = (await readdir(path.join(companiesRoot, exchange.name), {
      withFileTypes: true,
    })).filter((entry) => entry.isDirectory());
    for (const directory of directories) {
      try {
        companies.push(await readCompany(exchange.name, directory.name));
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    }
  }
  return companies.sort((left, right) =>
    String(left.metadata.name).localeCompare(String(right.metadata.name)),
  );
}

async function writeJson(absolutePath, value) {
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

const mandateText = await readFile(path.join(portfolioRoot, "mandate.md"), "utf8");
const mandate = parseFrontmatter(mandateText);
const [holdings, cash, watchlist, companies] = await Promise.all([
  readCsv(path.join(portfolioRoot, "holdings.csv")),
  readCsv(path.join(portfolioRoot, "cash.csv")),
  readCsv(path.join(portfolioRoot, "watchlist.csv")),
  readCompanies(),
]);

const datedValues = [
  mandate.attributes.mandate_updated,
  ...watchlist.map((row) => row.added_date),
  ...companies.flatMap((company) => [
    company.metadata.metadata_updated,
    company.price?.as_of?.slice(0, 10),
  ]),
].filter(Boolean);

await rm(temporaryRoot, { recursive: true, force: true });
await mkdir(temporaryRoot, { recursive: true });

const companyIndex = [];
for (const company of companies) {
  const companyPathParts = company.path.split("/");
  if (
    companyPathParts.length !== 4 ||
    companyPathParts[0] !== "vault" ||
    companyPathParts[1] !== "companies"
  ) {
    throw new Error(`Invalid canonical company path: ${company.path}`);
  }
  const [, , exchange, directory] = companyPathParts;
  const chunkDirectory = path.join(temporaryRoot, "companies", exchange, directory);
  const encodedBase = `/research-data/companies/${encodeURIComponent(exchange)}/${encodeURIComponent(directory)}`;
  const { documents, sources, ownership, financials, ...summary } = company;

  await writeJson(path.join(chunkDirectory, "profile.json"), {
    path: company.path,
    financials,
    documents,
    sources,
  });
  if (ownership) {
    await writeJson(path.join(chunkDirectory, "ownership.json"), ownership);
  }

  companyIndex.push({
    ...summary,
    documentCount: documents.length,
    sourceCount: sources.length,
    profileUrl: `${encodedBase}/profile.json`,
    ownershipUrl: ownership ? `${encodedBase}/ownership.json` : null,
  });
}

const index = {
  meta: {
    title: "Portfolio Research Reader",
    researchCutoff: datedValues.sort().at(-1) ?? null,
    generatedFrom: ["vault/portfolio", "vault/companies"],
  },
  portfolio: {
    mandate: {
      status: mandate.attributes.status,
      baseCurrency: mandate.attributes.base_currency,
      updated: mandate.attributes.mandate_updated,
      summary: summarizeMarkdown(mandate.body),
      path: "vault/portfolio/mandate.md",
    },
    holdings,
    cash,
    watchlist,
  },
  companies: companyIndex,
};

await writeJson(path.join(temporaryRoot, "index.json"), index);
await rm(generatedRoot, { recursive: true, force: true });
await rename(temporaryRoot, generatedRoot);

const ownershipStudies = companies.filter((company) => company.ownership).length;
console.log(
  `Built a ${companyIndex.length}-company index with ${companies.reduce((sum, company) => sum + company.documents.length, 0)} research documents, ${companies.reduce((sum, company) => sum + company.sources.length, 0)} source files, and ${ownershipStudies} lazy ownership studies.`,
);
