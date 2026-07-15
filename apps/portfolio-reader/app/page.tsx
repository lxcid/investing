"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import generatedIndex from "../public/research-data/index.json";

type NodeRow = {
  node_id: string;
  node_type: string;
  display_name: string;
  insider_class: string;
  current_role: string;
  current_insider: boolean | null;
  source_url: string;
  notes: string | null;
};

type EdgeRow = {
  edge_id: string;
  from_node_id: string;
  to_node_id: string;
  relationship_type: string;
  interest_classification: string;
  holding_component_id: string | null;
  data_classification: string;
  source_url: string;
};

type ComponentRow = {
  observation_id: string;
  as_of_date: string;
  holding_component_id: string;
  holder_node_id: string;
  shares: number;
  voting_shares_outstanding: number | null;
  ownership_pct: number | null;
  data_classification: string;
  source_url: string;
  notes: string | null;
};

type SeriesRow = {
  as_of_date: string;
  sequence: number;
  group_id: string;
  total_interest_shares: number;
  voting_shares_outstanding: number | null;
  ownership_pct: number | null;
  change_shares: number | null;
  ownership_pct_change: number | null;
  signal_status: string;
  notes: string;
};

type SignalRow = {
  event_id: string;
  event_date: string;
  group_id: string;
  before_total_shares: number;
  after_total_shares: number;
  change_shares: number;
  signal_status: string;
  review_required: boolean;
};

type EventRow = {
  event_id: string;
  filer_node_id: string;
  event_date: string;
  price_per_share: number;
  currency: string;
  change_location: string;
  source_url: string;
};

type InterestRow = {
  snapshot_id: string;
  as_of_date: string;
  sequence: number;
  filer_node_id: string;
  total_interest_shares: number;
  voting_shares_outstanding: number | null;
  total_interest_pct: number | null;
  source_url: string;
};

type GroupRow = {
  group_id: string;
  display_name: string;
  group_type: string;
  primary_signal: boolean;
  definition: string;
  warning: string;
};

type OwnershipData = {
  nodes: NodeRow[];
  edges: EdgeRow[];
  components: ComponentRow[];
  events: EventRow[];
  groups: GroupRow[];
  reportedInterests: InterestRow[];
  signals: SignalRow[];
  groupSeries: SeriesRow[];
};

type ResearchDocument = {
  id: string;
  path: string;
  relativePath: string;
  kind: string;
  title: string;
  summary: string;
  attributes: Record<string, string | number | boolean | string[]>;
  body: string;
};

type SourceFile = {
  path: string;
  name: string;
  category: string;
  extension: string;
  sizeBytes: number;
};

type PriceData = {
  price: number;
  currency: string;
  as_of: string;
  week_52_high: number;
  week_52_low: number;
  source_url: string;
};

type FinancialData = {
  period_end: string;
  currency: string;
  monetary_units: string;
  income_statement: {
    revenue: number;
    patmi: number;
    diluted_eps_sgd: number;
  };
  financial_position: {
    cash_and_cash_equivalents: number;
  };
};

type CompanySummary = {
  path: string;
  metadata: {
    ticker: string;
    exchange: string;
    isin: string;
    name: string;
    sector: string;
    industry: string;
    currency: string;
    research_status: string;
    portfolio_status: string;
    metadata_updated: string;
  };
  summary: string;
  price: PriceData | null;
  documentCount: number;
  sourceCount: number;
  profileUrl: string;
  ownershipUrl: string | null;
};

type CompanyProfile = {
  path: string;
  financials: FinancialData | null;
  documents: ResearchDocument[];
  sources: SourceFile[];
};

type Company = CompanySummary & CompanyProfile & {
  ownership: OwnershipData | null;
};

type RepositoryIndex = {
  meta: {
    title: string;
    researchCutoff: string | null;
  };
  portfolio: {
    mandate: {
      status: string;
      baseCurrency: string;
      updated: string;
      summary: string;
      path: string;
    };
    holdings: Record<string, unknown>[];
    cash: Record<string, unknown>[];
    watchlist: {
      company_path: string;
      added_date: string;
      next_review_date: string;
      reason: string;
    }[];
  };
  companies: CompanySummary[];
};

const repositoryIndex = generatedIndex as RepositoryIndex;

type View = "portfolio" | "company" | "ownership";

const numberFormat = new Intl.NumberFormat("en-SG");
const compactFormat = new Intl.NumberFormat("en-SG", {
  notation: "compact",
  maximumFractionDigits: 2,
});
const dateFormat = new Intl.DateTimeFormat("en-SG", {
  day: "2-digit",
  month: "short",
  timeZone: "Asia/Singapore",
  year: "numeric",
});

function formatDate(date: string | null | undefined) {
  if (!date) return "Not dated";
  return dateFormat.format(new Date(`${date.slice(0, 10)}T00:00:00+08:00`));
}

function formatPercent(value: number | null | undefined, digits = 3) {
  if (value == null) return "—";
  return `${(value * 100).toFixed(digits)}%`;
}

function formatSigned(value: number) {
  return `${value > 0 ? "+" : ""}${numberFormat.format(value)}`;
}

function labelize(value: string) {
  return value.replaceAll("_", " ");
}

function formatFileSize(bytes: number) {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  if (bytes >= 1_000) return `${Math.round(bytes / 1_000)} KB`;
  return `${bytes} B`;
}

function formatThousands(value: number | undefined, currency = "SGD") {
  if (value == null) return "—";
  return `${currency} ${(value / 1_000).toFixed(1)}m`;
}

async function fetchChunkJson<T>(url: string): Promise<T> {
  // Chunk URLs contain a hash of their JSON payload, so each URL is immutable.
  const response = await fetch(url, { cache: "force-cache" });
  if (!response.ok) {
    throw new Error(`Could not load ${url} (${response.status})`);
  }
  return response.json() as Promise<T>;
}

function cleanInlineText(value: string) {
  return value
    .replace(/!\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g, (_, target, label) =>
      label ?? `Embedded: ${String(target).split("/").at(-1)}`,
    )
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
    .replace(
      /\[\[([^\]]+)\]\]/g,
      (_, target) => String(target).split("/").at(-1) ?? String(target),
    )
    .replace(/\*\*/g, "")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .trim();
}

function InlineText({ value }: { value: string }) {
  const pattern = /(\[[^\]]+\]\(https?:\/\/[^)]+\))/g;
  const parts = value.split(pattern);
  return (
    <>
      {parts.map((part, index) => {
        const link = part.match(/^\[([^\]]+)\]\((https?:\/\/[^)]+)\)$/);
        if (link) {
          return (
            <a href={link[2]} key={`${link[2]}-${index}`} target="_blank" rel="noreferrer">
              {cleanInlineText(link[1])} ↗
            </a>
          );
        }
        return <Fragment key={`${part}-${index}`}>{cleanInlineText(part)}</Fragment>;
      })}
    </>
  );
}

function MarkdownReader({ body }: { body: string }) {
  const lines = body.split("\n");
  const blocks = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      if (level > 1 || index !== 0) {
        const Heading = level === 2 ? "h3" : level === 3 ? "h4" : "h2";
        blocks.push(
          <Heading key={`heading-${index}`}>
            <InlineText value={heading[2]} />
          </Heading>,
        );
      }
      index += 1;
      continue;
    }

    if (line.startsWith(">")) {
      const quote = [];
      while (index < lines.length && lines[index].startsWith(">")) {
        quote.push(lines[index].replace(/^>\s?/, "").replace(/^\[![^\]]+\]\s*/, ""));
        index += 1;
      }
      blocks.push(
        <aside className="research-callout" key={`quote-${index}`}>
          <InlineText value={quote.join(" ")} />
        </aside>,
      );
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      const items = [];
      while (index < lines.length && lines[index].trim()) {
        if (/^[-*]\s+/.test(lines[index])) {
          items.push(lines[index].replace(/^[-*]\s+/, ""));
        } else if (items.length && !/^(#{1,3})\s+/.test(lines[index])) {
          items[items.length - 1] += ` ${lines[index].trim()}`;
        } else {
          break;
        }
        index += 1;
      }
      blocks.push(
        <ul key={`list-${index}`}>
          {items.map((item, itemIndex) => (
            <li key={`${item}-${itemIndex}`}>
              <InlineText value={item} />
            </li>
          ))}
        </ul>,
      );
      continue;
    }

    if (line.trim().startsWith("|")) {
      const rows = [];
      while (index < lines.length && lines[index].trim().startsWith("|")) {
        rows.push(
          lines[index]
            .trim()
            .replace(/^\||\|$/g, "")
            .split("|")
            .map((cell) => cell.trim()),
        );
        index += 1;
      }
      const visibleRows = rows.filter(
        (row) => !row.every((cell) => /^:?-{3,}:?$/.test(cell)),
      );
      const [header = [], ...bodyRows] = visibleRows;
      blocks.push(
        <div className="markdown-table-wrap" key={`table-${index}`}>
          <table className="markdown-table">
            <thead>
              <tr>
                {header.map((cell, cellIndex) => (
                  <th key={`${cell}-${cellIndex}`}><InlineText value={cell} /></th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bodyRows.map((row, rowIndex) => (
                <tr key={`row-${rowIndex}`}>
                  {row.map((cell, cellIndex) => (
                    <td key={`${cell}-${cellIndex}`}><InlineText value={cell} /></td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    const paragraph = [line.trim()];
    index += 1;
    while (
      index < lines.length &&
      lines[index].trim() &&
      !/^(#{1,3})\s+/.test(lines[index]) &&
      !/^[-*]\s+/.test(lines[index]) &&
      !lines[index].startsWith(">") &&
      !lines[index].trim().startsWith("|")
    ) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    blocks.push(
      <p key={`paragraph-${index}`}><InlineText value={paragraph.join(" ")} /></p>,
    );
  }

  return <div className="markdown-body">{blocks}</div>;
}

function OwnershipChart({
  points,
  metric,
}: {
  points: SeriesRow[];
  metric: "shares" | "percent";
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const render = () => {
      const width = Math.max(canvas.clientWidth, 320);
      const height = 280;
      const ratio = window.devicePixelRatio || 1;
      canvas.width = width * ratio;
      canvas.height = height * ratio;
      const context = canvas.getContext("2d");
      if (!context) return;
      context.scale(ratio, ratio);
      context.clearRect(0, 0, width, height);

      const plot = points
        .map((point, pointIndex) => ({
          index: pointIndex,
          value: metric === "shares" ? point.total_interest_shares : point.ownership_pct,
        }))
        .filter(
          (point): point is { index: number; value: number } =>
            typeof point.value === "number",
        );
      if (plot.length < 2) return;

      const padding = { top: 24, right: 24, bottom: 42, left: 62 };
      const plotWidth = width - padding.left - padding.right;
      const plotHeight = height - padding.top - padding.bottom;
      const rawMin = Math.min(...plot.map((point) => point.value));
      const rawMax = Math.max(...plot.map((point) => point.value));
      const spread = Math.max(rawMax - rawMin, Math.abs(rawMax) * 0.001);
      const min = rawMin - spread * 0.28;
      const max = rawMax + spread * 0.18;
      const x = (pointIndex: number) =>
        padding.left + (pointIndex / Math.max(points.length - 1, 1)) * plotWidth;
      const y = (value: number) =>
        padding.top + ((max - value) / (max - min)) * plotHeight;

      context.strokeStyle = "rgba(18, 42, 32, 0.11)";
      context.lineWidth = 1;
      context.fillStyle = "#68756f";
      context.font = "11px ui-monospace, SFMono-Regular, Menlo, monospace";
      for (let lineIndex = 0; lineIndex < 4; lineIndex += 1) {
        const value = min + ((max - min) * lineIndex) / 3;
        const lineY = y(value);
        context.beginPath();
        context.moveTo(padding.left, lineY);
        context.lineTo(width - padding.right, lineY);
        context.stroke();
        context.fillText(
          metric === "shares" ? compactFormat.format(value) : formatPercent(value, 2),
          4,
          lineY + 4,
        );
      }

      const gradient = context.createLinearGradient(0, padding.top, 0, height);
      gradient.addColorStop(0, "rgba(20, 122, 74, 0.28)");
      gradient.addColorStop(1, "rgba(20, 122, 74, 0)");
      context.beginPath();
      plot.forEach((point, pointIndex) => {
        if (pointIndex === 0) context.moveTo(x(point.index), y(point.value));
        else context.lineTo(x(point.index), y(point.value));
      });
      context.lineTo(x(plot.at(-1)?.index ?? 0), height - padding.bottom);
      context.lineTo(x(plot[0].index), height - padding.bottom);
      context.closePath();
      context.fillStyle = gradient;
      context.fill();

      context.beginPath();
      plot.forEach((point, pointIndex) => {
        if (pointIndex === 0) context.moveTo(x(point.index), y(point.value));
        else context.lineTo(x(point.index), y(point.value));
      });
      context.strokeStyle = "#147a4a";
      context.lineWidth = 3;
      context.lineJoin = "round";
      context.stroke();

      plot.forEach((point) => {
        context.beginPath();
        context.arc(x(point.index), y(point.value), 4, 0, Math.PI * 2);
        context.fillStyle = "#f4f1e8";
        context.fill();
        context.strokeStyle = "#147a4a";
        context.lineWidth = 2;
        context.stroke();
      });

      context.fillStyle = "#68756f";
      context.textAlign = "left";
      context.fillText(formatDate(points[0].as_of_date), padding.left, height - 14);
      context.textAlign = "right";
      context.fillText(
        formatDate(points.at(-1)?.as_of_date ?? points[0].as_of_date),
        width - padding.right,
        height - 14,
      );
    };

    render();
    const observer = new ResizeObserver(render);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [metric, points]);

  return (
    <div className="chart-wrap">
      <canvas ref={canvasRef} className="ownership-chart" aria-label="Ownership series chart" />
    </div>
  );
}

function PortfolioView({
  data,
  companies,
  onOpenCompany,
}: {
  data: RepositoryIndex;
  companies: CompanySummary[];
  onOpenCompany: (company: CompanySummary) => void;
}) {
  const sourceCount = companies.reduce((sum, company) => sum + company.sourceCount, 0);
  const documentCount = companies.reduce((sum, company) => sum + company.documentCount, 0);

  return (
    <>
      <section className="reader-hero">
        <div>
          <p className="eyebrow">File-backed investment research</p>
          <h1>
            Read the evidence.
            <br />
            Keep the <em>files authoritative.</em>
          </h1>
          <p className="hero-description">
            A quiet reading layer over the portfolio repository—companies, research notes,
            structured facts, preserved sources, and specialist studies in one place.
          </p>
          <div className="hero-actions">
            <button className="primary-action" onClick={() => companies[0] && onOpenCompany(companies[0])}>
              Open company research <span aria-hidden="true">→</span>
            </button>
            <span className="cutoff">Evidence indexed through {formatDate(data.meta.researchCutoff)}</span>
          </div>
        </div>
        <aside className="mandate-card">
          <div className="card-label-row">
            <span>Investment mandate</span>
            <span className={`status-pill status-${data.portfolio.mandate.status}`}>
              {data.portfolio.mandate.status}
            </span>
          </div>
          <strong>{data.portfolio.mandate.baseCurrency}</strong>
          <p>Base currency</p>
          <blockquote>{data.portfolio.mandate.summary}</blockquote>
          <small>{data.portfolio.mandate.path} · updated {formatDate(data.portfolio.mandate.updated)}</small>
        </aside>
      </section>

      <section className="repository-strip" aria-label="Repository record counts">
        <article>
          <span>Companies</span>
          <strong>{companies.length}</strong>
          <small>Indexed company directories</small>
        </article>
        <article>
          <span>Watchlist records</span>
          <strong>{data.portfolio.watchlist.length}</strong>
          <small>Factual tracking state</small>
        </article>
        <article>
          <span>Research notes</span>
          <strong>{documentCount}</strong>
          <small>Rendered Markdown artifacts</small>
        </article>
        <article>
          <span>Preserved sources</span>
          <strong>{sourceCount}</strong>
          <small>Inventoried evidence files</small>
        </article>
      </section>

      <section className="library-section">
        <div className="section-heading">
          <div>
            <p className="section-kicker">Company library</p>
            <h2>Research by business, not by screen.</h2>
          </div>
          <p>
            Each company directory owns its identity, status, research, market data,
            evidence register, and any specialist analytical views.
          </p>
        </div>
        <div className="company-grid">
          {companies.map((company) => {
            const watchlist = data.portfolio.watchlist.find(
              (entry) => entry.company_path === company.path,
            );
            return (
              <button className="company-card" key={company.path} onClick={() => onOpenCompany(company)}>
                <div className="company-card-top">
                  <span className="exchange-mark">{company.metadata.exchange}</span>
                  <span>{company.metadata.research_status} · {company.metadata.portfolio_status}</span>
                </div>
                <h3>{company.metadata.name}</h3>
                <p>{company.metadata.industry}</p>
                <div className="company-quote">
                  <strong>
                    {company.price ? `${company.price.currency} ${company.price.price.toFixed(2)}` : "No price"}
                  </strong>
                  <span>{company.metadata.exchange}:{company.metadata.ticker}</span>
                </div>
                <dl>
                  <div><dt>Research</dt><dd>{company.documentCount} notes</dd></div>
                  <div><dt>Evidence</dt><dd>{company.sourceCount} files</dd></div>
                  <div><dt>Next review</dt><dd>{formatDate(watchlist?.next_review_date)}</dd></div>
                </dl>
                <span className="open-company">Open research →</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="research-contract">
        <div>
          <p className="section-kicker">Reading contract</p>
          <h2>One trail from document to judgment.</h2>
        </div>
        <ol>
          <li><span>01</span><strong>Sources</strong><p>Original filings stay untouched and inventoried.</p></li>
          <li><span>02</span><strong>Structured facts</strong><p>CSV and JSON retain dates, units, currency, and provenance.</p></li>
          <li><span>03</span><strong>Analysis</strong><p>Facts, calculations, claims, inferences, and judgments remain distinct.</p></li>
          <li><span>04</span><strong>Investor authority</strong><p>Signals invite review; they never execute a portfolio decision.</p></li>
        </ol>
      </section>
    </>
  );
}

function CompanyView({
  portfolio,
  company,
  selectedDocument,
  onSelectDocument,
  onOpenOwnership,
}: {
  portfolio: RepositoryIndex["portfolio"];
  company: Company;
  selectedDocument: ResearchDocument;
  onSelectDocument: (document: ResearchDocument) => void;
  onOpenOwnership: () => void;
}) {
  const watchlist = portfolio.watchlist.find((entry) => entry.company_path === company.path);
  const financials = company.financials;
  const price = company.price;

  return (
    <>
      <section className="company-hero">
        <div>
          <div className="company-badges">
            <span>{company.metadata.exchange}:{company.metadata.ticker}</span>
            <span>{company.metadata.research_status}</span>
            <span>{company.metadata.portfolio_status}</span>
          </div>
          <h1>{company.metadata.name}</h1>
          <p>{company.summary}</p>
          <div className="path-line">{company.path}</div>
        </div>
        <aside className="quote-card">
          <div className="card-label-row"><span>Latest dated price</span><span>{formatDate(price?.as_of)}</span></div>
          <strong>{price ? `${price.currency} ${price.price.toFixed(3)}` : "—"}</strong>
          {price && (
            <>
              <div className="range-track" aria-label="52 week price range">
                <span style={{ left: `${((price.price - price.week_52_low) / (price.week_52_high - price.week_52_low)) * 100}%` }} />
              </div>
              <div className="range-labels"><span>{price.week_52_low.toFixed(2)} low</span><span>{price.week_52_high.toFixed(2)} high</span></div>
              <a href={price.source_url} target="_blank" rel="noreferrer">Open market source ↗</a>
            </>
          )}
        </aside>
      </section>

      <section className="company-facts" aria-label="Latest structured company facts">
        <article><span>FY revenue</span><strong>{formatThousands(financials?.income_statement.revenue, financials?.currency)}</strong><small>Reported fact · {formatDate(financials?.period_end)}</small></article>
        <article><span>FY PATMI</span><strong>{formatThousands(financials?.income_statement.patmi, financials?.currency)}</strong><small>Reported fact</small></article>
        <article><span>Diluted EPS</span><strong>{financials ? `${financials.currency} ${financials.income_statement.diluted_eps_sgd.toFixed(4)}` : "—"}</strong><small>Reported fact</small></article>
        <article><span>Cash</span><strong>{formatThousands(financials?.financial_position.cash_and_cash_equivalents, financials?.currency)}</strong><small>Reported fact</small></article>
        <article><span>Next review</span><strong>{formatDate(watchlist?.next_review_date)}</strong><small>{watchlist?.reason ?? "No review scheduled"}</small></article>
      </section>

      <section className="reader-workspace">
        <aside className="document-nav">
          <div>
            <p className="section-kicker">Research files</p>
            <span>{company.documents.length} rendered documents</span>
          </div>
          <nav aria-label="Company research documents">
            {company.documents.map((document) => (
              <button
                className={document.id === selectedDocument.id ? "active" : ""}
                key={document.id}
                onClick={() => onSelectDocument(document)}
              >
                <span>{document.kind}</span>
                <strong>{document.title}</strong>
              </button>
            ))}
          </nav>
        </aside>

        <article className="document-reader">
          <div className="document-head">
            <div><span>{selectedDocument.kind}</span><h2>{selectedDocument.title}</h2></div>
            <code>{selectedDocument.path}</code>
          </div>
          <p className="document-summary">{selectedDocument.summary}</p>
          <MarkdownReader body={selectedDocument.body} />
        </article>

        <aside className="evidence-rail">
          <div>
            <p className="section-kicker">Evidence inventory</p>
            <strong>{company.sources.length} preserved files</strong>
          </div>
          <div className="evidence-list">
            {company.sources.slice(0, 8).map((source) => (
              <div key={source.path} title={source.path}>
                <span>{source.extension}</span>
                <p>{source.name}</p>
                <small>{source.category} · {formatFileSize(source.sizeBytes)}</small>
              </div>
            ))}
          </div>
          {company.sources.length > 8 && <small>+ {company.sources.length - 8} more in the source register</small>}
          {company.ownershipUrl && (
            <button className="ownership-launch" onClick={onOpenOwnership}>
              <span>Specialist view</span>
              <strong>Ownership dependency study</strong>
              <em>Open →</em>
            </button>
          )}
        </aside>
      </section>
    </>
  );
}

function OwnershipStudy({ company }: { company: Company }) {
  const ownership = company.ownership;
  if (!ownership) {
    return <section className="empty-state"><h1>No ownership study</h1><p>This company has no structured ownership dataset.</p></section>;
  }

  return <OwnershipStudyContent company={company} ownership={ownership} />;
}

function OwnershipStudyContent({ company, ownership }: { company: Company; ownership: OwnershipData }) {
  const primaryGroup = ownership.groups.find((group) => group.primary_signal) ?? ownership.groups[0];
  const chartGroups = ownership.groups.filter((group) =>
    ownership.groupSeries.some((point) => point.group_id === group.group_id),
  );
  const [selectedGroup, setSelectedGroup] = useState(primaryGroup.group_id);
  const [metric, setMetric] = useState<"shares" | "percent">("shares");
  const latestComponents = useMemo(() => {
    const byId = new Map<string, ComponentRow>();
    ownership.components.forEach((component) => {
      const current = byId.get(component.holding_component_id);
      if (!current || component.as_of_date > current.as_of_date) byId.set(component.holding_component_id, component);
    });
    return [...byId.values()].sort((left, right) => right.shares - left.shares);
  }, [ownership.components]);
  const [selectedComponent, setSelectedComponent] = useState(latestComponents[0]?.holding_component_id ?? "");

  const nodesById = useMemo(
    () => new Map(ownership.nodes.map((node) => [node.node_id, node])),
    [ownership.nodes],
  );
  const eventsById = useMemo(
    () => new Map(ownership.events.map((event) => [event.event_id, event])),
    [ownership.events],
  );
  const series = ownership.groupSeries
    .filter((point) => point.group_id === selectedGroup)
    .sort((left, right) => left.as_of_date.localeCompare(right.as_of_date) || left.sequence - right.sequence);
  const primarySeries = ownership.groupSeries
    .filter((point) => point.group_id === primaryGroup.group_id)
    .sort((left, right) => left.as_of_date.localeCompare(right.as_of_date));
  const firstPoint = primarySeries[0];
  const latestPoint = primarySeries.at(-1) ?? firstPoint;
  const primaryChange = latestPoint.total_interest_shares - firstPoint.total_interest_shares;
  const reviewCount = ownership.signals.filter((signal) => signal.review_required).length;
  const activeComponent = latestComponents.find((component) => component.holding_component_id === selectedComponent) ?? latestComponents[0];

  const upstreamFor = (component: ComponentRow) => {
    const ids = ownership.edges
      .filter((edge) => edge.holding_component_id === component.holding_component_id && ["direct", "deemed"].includes(edge.interest_classification))
      .map((edge) => edge.from_node_id);
    return [...new Set(ids)].map((id) => nodesById.get(id)).filter((node): node is NodeRow => Boolean(node));
  };

  const latestVotingShares = latestPoint.voting_shares_outstanding ?? 1;
  const latestInterests = ownership.nodes
    .filter((node) => node.current_insider)
    .map((node) => {
      const snapshots = ownership.reportedInterests
        .filter((snapshot) => snapshot.filer_node_id === node.node_id)
        .sort((left, right) => right.as_of_date.localeCompare(left.as_of_date) || right.sequence - left.sequence);
      return { node, snapshot: snapshots[0] };
    })
    .filter((entry): entry is { node: NodeRow; snapshot: InterestRow } => Boolean(entry.snapshot))
    .sort((left, right) => right.snapshot.total_interest_shares - left.snapshot.total_interest_shares);
  const recentSignals = [...ownership.signals].sort((left, right) => right.event_date.localeCompare(left.event_date));

  return (
    <>
      <section className="study-hero">
        <div>
          <p className="eyebrow">Specialist company study · ownership</p>
          <h1>Attribution paths without double counting.</h1>
          <p>
            {company.metadata.name} · legal disclosure views, economic holding components,
            and dated review signals remain distinct.
          </p>
        </div>
        <aside>
          <span>Interpretation rule</span>
          <strong>Deemed interest ≠ registered ownership</strong>
          <p>Reductions trigger evidence review. They do not authorize a sell decision.</p>
        </aside>
      </section>

      <section className="study-kpis">
        <article><span>Primary disclosed interest</span><strong>{compactFormat.format(latestPoint.total_interest_shares)}</strong><small>{primaryGroup.display_name}</small></article>
        <article><span>Latest ownership</span><strong>{formatPercent(latestPoint.ownership_pct)}</strong><small>On the disclosed voting denominator</small></article>
        <article><span>Series change</span><strong className="positive">{formatSigned(primaryChange)}</strong><small>From the first retained observation</small></article>
        <article className={reviewCount ? "alert-kpi" : "clear-kpi"}><span>Review signals</span><strong>{reviewCount}</strong><small>{reviewCount ? "Reduction or dilution needs review" : "No reduction or dilution flags"}</small></article>
      </section>

      <section className="ownership-dashboard">
        <article className="panel trajectory-panel">
          <div className="panel-header">
            <div><p className="section-kicker">Disclosure series</p><h2>Interest trajectory</h2></div>
            <div className="segmented" aria-label="Select ownership series">
              {chartGroups.map((group) => (
                <button className={selectedGroup === group.group_id ? "active" : ""} key={group.group_id} onClick={() => setSelectedGroup(group.group_id)}>
                  {group.display_name.replace(" disclosed total interest", "")}
                </button>
              ))}
            </div>
          </div>
          <div className="trajectory-meta">
            <div><span>Latest total</span><strong>{numberFormat.format(series.at(-1)?.total_interest_shares ?? 0)}</strong></div>
            <div><span>Series change</span><strong className="positive">{formatSigned((series.at(-1)?.total_interest_shares ?? 0) - (series[0]?.total_interest_shares ?? 0))}</strong></div>
            <div className="metric-toggle">
              <button className={metric === "shares" ? "active" : ""} onClick={() => setMetric("shares")}>Shares</button>
              <button className={metric === "percent" ? "active" : ""} onClick={() => setMetric("percent")}>Ownership %</button>
            </div>
          </div>
          <OwnershipChart points={series} metric={metric} />
          <div className="chart-footnote"><span>Missing percentages are not backfilled.</span><span>{ownership.groups.find((group) => group.group_id === selectedGroup)?.warning}</span></div>
        </article>

        <aside className="panel signal-panel">
          <div className="panel-header"><div><p className="section-kicker">Signal log</p><h2>Recent changes</h2></div><span className="status-pill status-clear">Clear</span></div>
          <div className="signal-list">
            {recentSignals.map((signal) => {
              const event = eventsById.get(signal.event_id);
              const filer = event ? nodesById.get(event.filer_node_id) : null;
              return (
                <a className="signal-row" href={event?.source_url} target="_blank" rel="noreferrer" key={signal.event_id}>
                  <span className="signal-icon">{signal.change_shares >= 0 ? "+" : "−"}</span>
                  <span><strong>{filer?.display_name ?? "Insider"}</strong><small>{formatDate(signal.event_date)} · {event?.change_location ?? "interest"}</small></span>
                  <span className="signal-value"><strong>{compactFormat.format(signal.change_shares)}</strong><small>{event ? `${event.currency} ${event.price_per_share.toFixed(3)}` : "Filed"}</small></span>
                </a>
              );
            })}
          </div>
          <p className="signal-rule"><strong>Review rule</strong>A fall in a stable filer total is flagged. Dilution is classified separately from a share-count reduction.</p>
        </aside>
      </section>

      <section className="graph-section">
        <div className="section-heading"><div><p className="section-kicker">Dependency graph</p><h2>One block. Every attribution path.</h2></div><p>Select a component to see who is attributed the interest, who holds it, and how it reaches the issuer.</p></div>
        <div className="graph-layout">
          <div className="graph-panel panel">
            <div className="graph-columns"><span>Attributed insider</span><span>Held through / by</span><span>Issuer</span></div>
            <div className="graph-rows">
              {latestComponents.map((component) => {
                const upstream = upstreamFor(component);
                const holder = nodesById.get(component.holder_node_id);
                const active = component.holding_component_id === activeComponent.holding_component_id;
                return (
                  <button className={`graph-row ${active ? "active" : ""}`} key={component.holding_component_id} onClick={() => setSelectedComponent(component.holding_component_id)}>
                    <span className="graph-people">{upstream.map((person) => <span className="person-node" key={person.node_id}>{person.display_name.replace(/^Dr |^Mdm /, "")}</span>)}</span>
                    <span className="connector"><i /><b>›</b></span>
                    <span className={`holder-node ${upstream.length > 1 ? "shared" : ""}`}><small>{upstream.length > 1 ? "shared component" : labelize(component.data_classification)}</small><strong>{holder?.display_name ?? "Unknown holder"}</strong><em>{compactFormat.format(component.shares)} shares</em></span>
                    <span className="connector"><i /><b>›</b></span>
                    <span className="issuer-node"><strong>{company.metadata.ticker}</strong><small>{company.metadata.exchange}</small></span>
                  </button>
                );
              })}
            </div>
          </div>
          <aside className="component-detail panel">
            <p className="section-kicker">Selected component</p>
            <h3>{nodesById.get(activeComponent.holder_node_id)?.display_name}</h3>
            <div className="component-number"><strong>{numberFormat.format(activeComponent.shares)}</strong><span>ordinary shares</span></div>
            <dl>
              <div><dt>Attributed to</dt><dd>{upstreamFor(activeComponent).map((node) => node.display_name).join(", ")}</dd></div>
              <div><dt>Issuer ownership</dt><dd>{formatPercent(activeComponent.ownership_pct)}</dd></div>
              <div><dt>Observation date</dt><dd>{formatDate(activeComponent.as_of_date)}</dd></div>
              <div><dt>Evidence class</dt><dd>{labelize(activeComponent.data_classification)}</dd></div>
            </dl>
            <p className="component-note">{activeComponent.notes}</p>
            <a className="source-link" href={activeComponent.source_url} target="_blank" rel="noreferrer">Open primary disclosure ↗</a>
          </aside>
        </div>
      </section>

      <section className="insider-section">
        <div className="section-heading"><div><p className="section-kicker">Insider register</p><h2>Latest disclosed interests</h2></div><p>Rows preserve each filer&apos;s legal disclosure view. They are not added together.</p></div>
        <div className="table-wrap panel">
          <table>
            <thead><tr><th>Insider</th><th>Role</th><th className="numeric">Total interest</th><th className="numeric">Ownership</th><th>As of</th></tr></thead>
            <tbody>
              {latestInterests.map(({ node, snapshot }) => {
                const calculatedPct = snapshot.total_interest_pct ?? snapshot.total_interest_shares / latestVotingShares;
                return <tr key={node.node_id}><td><a href={snapshot.source_url} target="_blank" rel="noreferrer">{node.display_name}</a></td><td>{node.current_role}</td><td className="numeric">{numberFormat.format(snapshot.total_interest_shares)}</td><td className="numeric">{formatPercent(calculatedPct)}</td><td>{formatDate(snapshot.as_of_date)}</td></tr>;
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

export default function Home() {
  const data = repositoryIndex;
  const [view, setView] = useState<View>("portfolio");
  const [selectedCompanyPath, setSelectedCompanyPath] = useState("");
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [selectedDocumentId, setSelectedDocumentId] = useState("");
  const [loading, setLoading] = useState("");
  const [error, setError] = useState("");
  const companyCache = useRef(new Map<string, Company>());
  const ownershipCache = useRef(new Map<string, OwnershipData>());
  const requestSequence = useRef(0);

  const selectedDocument = selectedCompany
    ? selectedCompany.documents.find((document) => document.id === selectedDocumentId) ??
      selectedCompany.documents.find((document) => document.kind === "Analysis") ??
      selectedCompany.documents[0]
    : undefined;

  const openCompany = async (summary: CompanySummary) => {
    const request = ++requestSequence.current;
    setSelectedCompanyPath(summary.path);
    setView("company");
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });

    const cached = companyCache.current.get(summary.path);
    if (cached) {
      setSelectedCompany(cached);
      const nextDocument =
        cached.documents.find((document) => document.kind === "Analysis") ?? cached.documents[0];
      setSelectedDocumentId(nextDocument?.id ?? "");
      setLoading("");
      return;
    }

    setSelectedCompany(null);
    setLoading(`Loading ${summary.metadata.name}…`);
    try {
      const profile = await fetchChunkJson<CompanyProfile>(summary.profileUrl);
      if (profile.path !== summary.path) {
        throw new Error(`Profile path mismatch for ${summary.metadata.name}.`);
      }
      const company: Company = {
        ...summary,
        ...profile,
        ownership: ownershipCache.current.get(summary.path) ?? null,
      };
      companyCache.current.set(summary.path, company);
      if (request !== requestSequence.current) return;
      setSelectedCompany(company);
      const nextDocument =
        company.documents.find((document) => document.kind === "Analysis") ?? company.documents[0];
      setSelectedDocumentId(nextDocument?.id ?? "");
    } catch (loadError) {
      if (request !== requestSequence.current) return;
      setError(
        loadError instanceof Error ? loadError.message : `Could not load ${summary.metadata.name}.`,
      );
    } finally {
      if (request === requestSequence.current) setLoading("");
    }
  };

  const openOwnership = async () => {
    if (!selectedCompany?.ownershipUrl) return;
    setView("ownership");
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (selectedCompany.ownership) return;

    const request = ++requestSequence.current;
    setLoading(`Loading ${selectedCompany.metadata.name} ownership data…`);
    try {
      const ownership = await fetchChunkJson<OwnershipData>(selectedCompany.ownershipUrl);
      ownershipCache.current.set(selectedCompany.path, ownership);
      if (request !== requestSequence.current) return;
      const company = { ...selectedCompany, ownership };
      companyCache.current.set(company.path, company);
      setSelectedCompany(company);
    } catch (loadError) {
      if (request !== requestSequence.current) return;
      setError(
        loadError instanceof Error ? loadError.message : "Could not load the ownership study.",
      );
    } finally {
      if (request === requestSequence.current) setLoading("");
    }
  };

  const navigate = (nextView: View) => {
    if (nextView === "portfolio") {
      requestSequence.current += 1;
      setLoading("");
      setError("");
      setView(nextView);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    if (nextView === "ownership") {
      void openOwnership();
      return;
    }
    const summary =
      data.companies.find((company) => company.path === selectedCompanyPath) ?? data.companies[0];
    if (summary) void openCompany(summary);
  };

  return (
    <main>
      <header className="topbar">
        <button className="brand" onClick={() => navigate("portfolio")} aria-label="Portfolio Research Reader home">
          <span className="brand-mark">PR</span>
          <span>Portfolio Reader</span>
        </button>
        <nav aria-label="Reader views">
          <button className={view === "portfolio" ? "active" : ""} onClick={() => navigate("portfolio")}>Portfolio</button>
          <button className={view === "company" ? "active" : ""} disabled={!data.companies.length} onClick={() => navigate("company")}>Company research</button>
          <button className={view === "ownership" ? "active" : ""} disabled={!selectedCompany?.ownershipUrl} onClick={() => navigate("ownership")}>Ownership study</button>
        </nav>
        <div className="repository-chip"><span className="live-dot" />Read-only · {data.portfolio.mandate.baseCurrency}</div>
      </header>

      {error && <section className="empty-state" role="alert"><h1>Reader data unavailable</h1><p>{error}</p></section>}
      {!error && loading && <section className="empty-state" aria-live="polite"><h1>Reading the vault</h1><p>{loading}</p></section>}
      {!error && !loading && view === "portfolio" && (
        <PortfolioView data={data} companies={data.companies} onOpenCompany={(company) => void openCompany(company)} />
      )}
      {!error && !loading && view === "company" && selectedCompany && selectedDocument && (
        <CompanyView
          portfolio={data.portfolio}
          company={selectedCompany}
          selectedDocument={selectedDocument}
          onSelectDocument={(document) => setSelectedDocumentId(document.id)}
          onOpenOwnership={() => void openOwnership()}
        />
      )}
      {!error && !loading && view === "ownership" && selectedCompany?.ownership && (
        <OwnershipStudy company={selectedCompany} />
      )}

      <footer>
        <div><strong>Portfolio Research Reader</strong><span>Read-only projection of repository evidence and analysis.</span></div>
        <p>Repository files remain authoritative. Research signals prompt review and never authorize a portfolio action.</p>
      </footer>
    </main>
  );
}
