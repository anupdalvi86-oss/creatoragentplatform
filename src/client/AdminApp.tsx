import { useEffect, useState } from "react";
import type { Creator } from "../shared/types";

type Metrics = {
  events: Array<{ event_type: string; count: number }>;
  ai: Array<{
    feature: string;
    cost: number;
    requests: number;
    unpriced_requests: number;
  }>;
  confirmedRevenue: Array<{ source: string; currency: string; net: number }>;
};
type Gate = {
  feature: string;
  required_entitlement: string | null;
  free_usage_limit: number | null;
  reset_period: string;
  trial_usage: number;
  enabled: number;
};
type ContentRow = {
  id: string;
  title: string;
  description: string;
  source_url: string;
  rights_status: string;
  processing_status: string;
  structured_json: string;
};
type ProductSpecRow = {
  id: string;
  version: number;
  reviewStatus: string;
  spec: unknown;
  createdAt: string;
};
type AgentConfig = {
  instructions: string;
  modelPolicy: "CHEAP" | "STANDARD" | "REASONING";
  maxTokens: number;
  maxCostUsd: number;
  enabledTools: string[];
  promptVersion: string;
};
type ExperimentRow = {
  id: string;
  feature: string;
  status: string;
  variants: Array<{
    key: string;
    freeUsageLimit?: number;
    trialUsage?: number;
  }>;
};
type CampaignRow = {
  id: string;
  brand: string;
  status: string;
  placements: string[];
  startsAt: string | null;
  endsAt: string | null;
};
type AffiliateRow = {
  id: string;
  slug: string;
  label: string;
  destination_host: string;
  placement: string | null;
  active: number;
  clicks: number;
};
type RevenueRow = {
  id: string;
  source: string;
  net_amount: number;
  currency: string;
  status: string;
  occurred_at: string;
};
type AgentRoleRow = {
  id: string;
  roleKey: string;
  roleName: string;
  description: string;
  category: string;
  enabled: boolean;
  requiresApproval: boolean;
};
type AgentTaskRow = {
  id: string;
  roleId: string;
  status: string;
  priority: number;
  input: Record<string, unknown>;
  result: Record<string, unknown> | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
};
type QualityFindingRow = {
  id: string;
  findingType: string;
  severity: string;
  resourceType: string;
  resourceId: string | null;
  details: Record<string, unknown>;
  suggestedAction: string | null;
  reviewedAt: string | null;
  createdAt: string;
};
const cookingTools = [
  "searchCreatorKnowledge",
  "findSubstitution",
  "calculateServings",
  "createMealPlan",
  "createShoppingList",
];
function normalizeCreatorUrl(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const candidate = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  try {
    const parsed = new URL(candidate);
    if (!["http:", "https:"].includes(parsed.protocol) || !parsed.hostname)
      throw new Error();
    return parsed.toString();
  } catch {
    throw new Error("Enter a valid Creator URL, such as https://youtube.com/@creator.");
  }
}
type ScoutResult = {
  runId: string;
  providerResults: Array<{ provider: string; status: string; count: number }>;
  facts: unknown[];
  opportunity: unknown;
  productSpec: unknown;
  reviewStatus: string;
  monetizationHypothesis?: unknown;
};

function BrandEditor({
  creator,
  onSave,
  busy,
}: {
  creator: Creator;
  onSave: (
    name: string,
    brand: Creator["brand"],
    creatorUrl: string,
    status: string,
  ) => Promise<void>;
  busy: boolean;
}) {
  const [name, setName] = useState(creator.name);
  const [accent, setAccent] = useState(creator.brand.accent);
  const [hero, setHero] = useState(creator.brand.hero);
  const [disclaimer, setDisclaimer] = useState(creator.brand.disclaimer);
  const [creatorUrl, setCreatorUrl] = useState(creator.creatorUrl || "");
  const [status, setStatus] = useState(creator.status);
  return (
    <section>
      <h2>Creator identity</h2>
      <label>
        Display name
        <input value={name} onChange={(event) => setName(event.target.value)} />
      </label>
      <label>
        Accent
        <input
          type="color"
          value={accent}
          onChange={(event) => setAccent(event.target.value)}
        />
      </label>
      <label>
        Hero copy
        <input value={hero} onChange={(event) => setHero(event.target.value)} />
      </label>
      <label>
        Disclosure
        <textarea
          value={disclaimer}
          onChange={(event) => setDisclaimer(event.target.value)}
          rows={3}
        />
      </label>
      <label>
        Creator URL
        <input
          type="text"
          inputMode="url"
          value={creatorUrl}
          onChange={(event) => setCreatorUrl(event.target.value)}
          placeholder="https://youtube.com/@creator or https://creator.example"
        />
      </label>
      <label>
        Status
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value)}
        >
          <option value="demo">Demo</option>
          <option value="active">Active</option>
          <option value="paused">Paused</option>
        </select>
      </label>
      <p>
        Activation requires at least one ready source marked creator authorized,
        creator uploaded, or licensed.
      </p>
      <button
        disabled={busy}
        onClick={() => onSave(name, { accent, hero, disclaimer }, creatorUrl, status)}
      >
        Save identity
      </button>
      <a href={`/creator/${creator.slug}`}>Open creator page ↗</a>
    </section>
  );
}

function ContentEditor({
  item,
  slug,
  onSave,
  busy,
}: {
  item: ContentRow;
  slug: string;
  onSave: (item: ContentRow, metaChanged: boolean) => Promise<void>;
  busy: boolean;
}) {
  const [draft, setDraft] = useState(item);
  const sourceUrl = item.source_url.startsWith("/")
    ? `${item.source_url}?creator=${encodeURIComponent(slug)}`
    : item.source_url;
  return (
    <div className="admin-editor">
      <label>
        Title
        <input
          value={draft.title}
          onChange={(event) =>
            setDraft({ ...draft, title: event.target.value })
          }
        />
      </label>
      <label>
        Description
        <textarea
          value={draft.description}
          onChange={(event) =>
            setDraft({ ...draft, description: event.target.value })
          }
          rows={3}
        />
      </label>
      <div className="admin-editor-row">
        <label>
          Rights
          <select
            value={draft.rights_status}
            onChange={(event) =>
              setDraft({ ...draft, rights_status: event.target.value })
            }
          >
            {[
              "public_metadata",
              "creator_authorized",
              "creator_uploaded",
              "licensed",
              "AI_generated",
              "unknown_rights",
            ].map((status) => (
              <option key={status}>{status}</option>
            ))}
          </select>
        </label>
        <label>
          Status
          <select
            value={draft.processing_status}
            onChange={(event) =>
              setDraft({ ...draft, processing_status: event.target.value })
            }
          >
            {["ready", "review", "hidden"].map((status) => (
              <option key={status}>{status}</option>
            ))}
          </select>
        </label>
      </div>
      {draft.rights_status === "public_metadata" && (
        <p className="metadata-note">
          This video metadata was already saved automatically from YouTube.
          Save only if you edit the title, description, or review status. To
          add ingredients, use creator-authorized metadata instead.
        </p>
      )}
      <details>
        <summary>Structured recipe metadata (JSON)</summary>
        <p>
          Only add ingredient metadata for an authorized, uploaded, licensed, or
          illustrative source.
        </p>
        <textarea
          value={draft.structured_json}
          onChange={(event) =>
            setDraft({ ...draft, structured_json: event.target.value })
          }
          rows={9}
        />
      </details>
      <div className="admin-editor-actions">
        <button
          disabled={busy}
          onClick={() =>
            onSave(draft, draft.structured_json !== item.structured_json)
          }
        >
          Save changes
        </button>
        <a href={sourceUrl} target="_blank" rel="noopener noreferrer">
          Source ↗
        </a>
      </div>
    </div>
  );
}

function AuthorizedImport({
  onCreate,
  busy,
}: {
  onCreate: (value: unknown) => Promise<void>;
  busy: boolean;
}) {
  const [sourceUrl, setSourceUrl] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [rightsStatus, setRightsStatus] = useState("creator_authorized");
  const [ingredients, setIngredients] = useState("");
  const [minutes, setMinutes] = useState(30);
  const [servings, setServings] = useState(2);
  const [mealType, setMealType] = useState("main");
  const [diet, setDiet] = useState("");
  const [equipment, setEquipment] = useState("");
  const [tags, setTags] = useState("");
  const split = (value: string) =>
    value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
  async function submit() {
    const parsedIngredients = ingredients
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => {
        const [name, quantity, unit, category] = line
          .split(",")
          .map((part) => part.trim());
        return { name, quantity: Number(quantity), unit, category };
      });
    await onCreate({
      sourceUrl,
      title,
      description,
      rightsStatus,
      tags: split(tags),
      meta: {
        minutes,
        servings,
        mealType,
        diet: split(diet),
        equipment: split(equipment),
        ingredients: parsedIngredients,
      },
    });
  }
  return (
    <section>
      <h2>Import authorized recipe metadata</h2>
      <p>
        Use only sources with creator permission or a license. Enter your own
        concise metadata; do not paste recipe steps.
      </p>
      <label>
        Original HTTPS URL
        <input
          value={sourceUrl}
          onChange={(e) => setSourceUrl(e.target.value)}
          placeholder="https://…"
        />
      </label>
      <label>
        Title
        <input value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <label>
        Short summary
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
        />
      </label>
      <div className="admin-editor-row">
        <label>
          Rights
          <select
            value={rightsStatus}
            onChange={(e) => setRightsStatus(e.target.value)}
          >
            <option value="creator_authorized">Creator authorized</option>
            <option value="creator_uploaded">Creator uploaded</option>
            <option value="licensed">Licensed</option>
          </select>
        </label>
        <label>
          Meal
          <select
            value={mealType}
            onChange={(e) => setMealType(e.target.value)}
          >
            <option value="main">Dinner/main</option>
            <option value="lunch">Lunchbox</option>
            <option value="side">Side</option>
          </select>
        </label>
        <label>
          Minutes
          <input
            type="number"
            min="1"
            max="240"
            value={minutes}
            onChange={(e) => setMinutes(Number(e.target.value))}
          />
        </label>
        <label>
          Servings
          <input
            type="number"
            min="1"
            max="50"
            value={servings}
            onChange={(e) => setServings(Number(e.target.value))}
          />
        </label>
      </div>
      <label>
        Ingredients, one per line: name, quantity, unit, category
        <textarea
          value={ingredients}
          onChange={(e) => setIngredients(e.target.value)}
          rows={5}
          placeholder="paneer, 200, g, dairy"
        />
      </label>
      <p>Categories: vegetables, dairy, pantry, protein, spices, other.</p>
      <div className="admin-editor-row">
        <label>
          Diet tags
          <input
            value={diet}
            onChange={(e) => setDiet(e.target.value)}
            placeholder="vegetarian, high-protein"
          />
        </label>
        <label>
          Equipment
          <input
            value={equipment}
            onChange={(e) => setEquipment(e.target.value)}
            placeholder="stovetop"
          />
        </label>
        <label>
          Search tags
          <input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="quick, no-oven"
          />
        </label>
      </div>
      <button disabled={busy} onClick={submit}>
        Import source metadata
      </button>
    </section>
  );
}

function AgentEditor({
  agent,
  onSave,
  busy,
}: {
  agent: AgentConfig;
  onSave: (value: AgentConfig) => Promise<void>;
  busy: boolean;
}) {
  const [draft, setDraft] = useState(agent);
  return (
    <section>
      <h2>Cooking agent</h2>
      <p>
        Changes here affect new answers. The platform still enforces source
        grounding and cost limits.
      </p>
      <label>
        Instructions
        <textarea
          value={draft.instructions}
          onChange={(event) =>
            setDraft({ ...draft, instructions: event.target.value })
          }
          rows={5}
        />
      </label>
      <div className="admin-editor-row">
        <label>
          Model policy
          <select
            value={draft.modelPolicy}
            onChange={(event) =>
              setDraft({
                ...draft,
                modelPolicy: event.target.value as AgentConfig["modelPolicy"],
              })
            }
          >
            <option>CHEAP</option>
            <option>STANDARD</option>
            <option>REASONING</option>
          </select>
        </label>
        <label>
          Token ceiling
          <input
            type="number"
            min="50"
            max="1000"
            value={draft.maxTokens}
            onChange={(event) =>
              setDraft({ ...draft, maxTokens: Number(event.target.value) })
            }
          />
        </label>
        <label>
          Cost ceiling (USD)
          <input
            type="number"
            min="0.001"
            max="0.05"
            step="0.001"
            value={draft.maxCostUsd}
            onChange={(event) =>
              setDraft({ ...draft, maxCostUsd: Number(event.target.value) })
            }
          />
        </label>
      </div>
      <p>Available tools</p>
      {cookingTools.map((tool) => (
        <label className="admin-tool" key={tool}>
          <input
            type="checkbox"
            checked={draft.enabledTools.includes(tool)}
            disabled={tool === "searchCreatorKnowledge"}
            onChange={(event) =>
              setDraft({
                ...draft,
                enabledTools: event.target.checked
                  ? [...draft.enabledTools, tool]
                  : draft.enabledTools.filter((name) => name !== tool),
              })
            }
          />
          {tool}
        </label>
      ))}
      <p>Prompt version: {draft.promptVersion}</p>
      <button disabled={busy} onClick={() => onSave(draft)}>
        Save agent
      </button>
    </section>
  );
}

export default function AdminApp() {
  const [token, setToken] = useState("");
  const [creators, setCreators] = useState<Creator[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [tab, setTab] = useState<
    "overview" | "content" | "agent" | "operations" | "scout" | "monetization"
  >("overview");
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [gates, setGates] = useState<Gate[]>([]);
  const [content, setContent] = useState<ContentRow[]>([]);
  const [agentConfig, setAgentConfig] = useState<AgentConfig | null>(null);
  const [specs, setSpecs] = useState<ProductSpecRow[]>([]);
  const [experiments, setExperiments] = useState<ExperimentRow[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [affiliates, setAffiliates] = useState<AffiliateRow[]>([]);
  const [revenue, setRevenue] = useState<RevenueRow[]>([]);
  const [agentRoles, setAgentRoles] = useState<AgentRoleRow[]>([]);
  const [agentTasks, setAgentTasks] = useState<AgentTaskRow[]>([]);
  const [qualityFindings, setQualityFindings] = useState<QualityFindingRow[]>([]);
  const [experimentFeature, setExperimentFeature] = useState("AI_VOICE");
  const [experimentControl, setExperimentControl] = useState(2);
  const [experimentVariant, setExperimentVariant] = useState(5);
  const [campaignBrand, setCampaignBrand] = useState("");
  const [campaignPlacement, setCampaignPlacement] = useState("");
  const [scout, setScout] = useState<ScoutResult | null>(null);
  const [newCreatorUrl, setNewCreatorUrl] = useState("");
  const [researchUrl, setResearchUrl] = useState("");
  const [audienceNotes, setAudienceNotes] = useState("");
  const [contentNotes, setContentNotes] = useState("");
  const [channelId, setChannelId] = useState("");
  const [affiliateSlug, setAffiliateSlug] = useState("");
  const [affiliateUrl, setAffiliateUrl] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const selected = creators.find((creator) => creator.id === selectedId);

  useEffect(() => {
    setResearchUrl(selected?.creatorUrl || "");
    setChannelId(selected?.creatorUrl || "");
    setAudienceNotes("");
    setContentNotes("");
    setScout(null);
  }, [selectedId]);

  async function admin<T>(
    path: string,
    method = "GET",
    data?: unknown,
  ): Promise<T> {
    let response = await fetch(`/api/admin${path}`, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(data ? { "Content-Type": "application/json" } : {}),
      },
      body: data ? JSON.stringify(data) : undefined,
    });
    if (
      response.status === 401 &&
      ["localhost", "127.0.0.1"].includes(location.hostname)
    ) {
      await fetch("/api/admin/local-session", {
        method: "POST",
        credentials: "same-origin",
      });
      response = await fetch(`/api/admin${path}`, {
        method,
        credentials: "same-origin",
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(data ? { "Content-Type": "application/json" } : {}),
        },
        body: data ? JSON.stringify(data) : undefined,
      });
    }
    const result = (await response.json()) as T & { error?: string };
    if (!response.ok)
      throw new Error(result.error || `Request failed (${response.status})`);
    return result;
  }
  async function loadCreators() {
    try {
      const list = await admin<Creator[]>("/creators");
      setCreators(list);
      setSelectedId((current) => current || list[0]?.id || "");
      setMessage("");
    } catch (error) {
      setMessage((error as Error).message);
    }
  }
  useEffect(() => {
    loadCreators();
  }, [token]);
  useEffect(() => {
    if (!selectedId) return;
    Promise.all([
      admin<Metrics>(`/metrics/${selectedId}`),
      admin<Gate[]>(`/gates/${selectedId}`),
      admin<ContentRow[]>(`/content/${selectedId}`),
      admin<ProductSpecRow[]>(`/specs/${selectedId}`),
      admin<AgentConfig>(`/agent/${selectedId}`),
      admin<ExperimentRow[]>(`/experiments/${selectedId}`),
      admin<CampaignRow[]>(`/campaigns/${selectedId}`),
      admin<AffiliateRow[]>(`/affiliate/${selectedId}`),
      admin<RevenueRow[]>(`/revenue/${selectedId}`),
      admin<{ roles: AgentRoleRow[] }>("/agent-roles"),
      admin<{ tasks: AgentTaskRow[] }>(`/agent-tasks/${selectedId}`),
      admin<{ findings: QualityFindingRow[] }>(`/data-quality/findings/${selectedId}`),
    ])
      .then(([m, g, c, s, a, e, campaignsData, links, ledger, roles, tasks, findings]) => {
        setMetrics(m);
        setGates(g);
        setContent(c);
        setSpecs(s);
        setAgentConfig(a);
        setExperiments(e);
        setCampaigns(campaignsData);
        setAffiliates(links);
        setRevenue(ledger);
        setAgentRoles(roles.roles);
        setAgentTasks(tasks.tasks);
        setQualityFindings(findings.findings);
      })
      .catch((error: Error) => setMessage(error.message));
  }, [selectedId, token]);
  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    setMessage("");
    try {
      await action();
      setMessage(success);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function createCreator() {
    let setupResult: {
      id?: string;
      slug?: string;
      platform?: string;
      pwaUrl?: string;
      contentImport?: { status?: string; processed?: number; error?: string };
      tasks?: Array<{ roleKey: string; status: string; error?: string }>;
    } = {};
    await run(async () => {
      const creatorUrl = normalizeCreatorUrl(newCreatorUrl);
      const created = await admin<{
        id: string;
        slug: string;
        platform: string;
        pwaUrl: string;
        contentImport?: { status?: string; processed?: number; error?: string };
        tasks?: Array<{ roleKey: string; status: string; error?: string }>;
      }>("/creator-setup", "POST", { sourceUrl: creatorUrl });
      setupResult = created;
      const importResult = created.contentImport || {};
      await loadCreators();
      setSelectedId(created.id);
      setResearchUrl(creatorUrl || "");
      setChannelId(creatorUrl || "");
      setTab(importResult.processed ? "content" : "operations");
      setNewCreatorUrl("");
    }, "Creator PWA setup started.");
    if (setupResult.pwaUrl) {
      const imported = setupResult.contentImport?.processed || 0;
      const failedTasks = setupResult.tasks?.filter((task) => task.status === "failed").length || 0;
      const connectorNote = setupResult.platform === "instagram"
        ? " Instagram requires an authorized Professional account before content can be imported."
        : setupResult.platform === "other"
          ? " This source needs a supported connector or authorized upload before content can be added."
          : "";
      setMessage(`PWA ready at ${setupResult.pwaUrl}. ${imported} public content items imported; ${setupResult.tasks?.length || 0} setup agents started${failedTasks ? `, ${failedTasks} need attention` : ""}.${connectorNote}`);
    }
  }
  async function createExperiment() {
    await run(async () => {
      const field =
        experimentFeature === "AI_VOICE" ? "trialUsage" : "freeUsageLimit";
      await admin(`/experiments/${selectedId}`, "POST", {
        feature: experimentFeature,
        variants: [
          { key: "control", [field]: experimentControl },
          { key: "variant", [field]: experimentVariant },
        ],
        status: "draft",
      });
      setExperiments(
        await admin<ExperimentRow[]>(`/experiments/${selectedId}`),
      );
    }, "Draft experiment created. Activate it after review.");
  }
  async function updateExperiment(id: string, status: string) {
    await run(async () => {
      await admin(`/experiments/${selectedId}/${id}`, "PATCH", { status });
      setExperiments(
        await admin<ExperimentRow[]>(`/experiments/${selectedId}`),
      );
    }, `Experiment ${status}.`);
  }
  async function createCampaign() {
    await run(async () => {
      await admin(`/campaigns/${selectedId}`, "POST", {
        brand: campaignBrand,
        value: { note: "Commercial terms require separate approval" },
        placements: [campaignPlacement],
        status: "draft",
      });
      setCampaigns(await admin<CampaignRow[]>(`/campaigns/${selectedId}`));
    }, "Draft campaign created. Sponsored placement must be clearly labelled before activation.");
  }
  async function updateCampaign(id: string, status: string) {
    await run(async () => {
      await admin(`/campaigns/${selectedId}/${id}`, "PATCH", { status });
      setCampaigns(await admin<CampaignRow[]>(`/campaigns/${selectedId}`));
    }, `Campaign ${status}.`);
  }
  async function saveGate(gate: Gate) {
    await run(async () => {
      await admin(`/gates/${selectedId}`, "PUT", {
        feature: gate.feature,
        requiredEntitlement: gate.required_entitlement,
        freeUsageLimit: gate.free_usage_limit,
        resetPeriod: gate.reset_period,
        trialUsage: gate.trial_usage,
        enabled: !!gate.enabled,
      });
      setGates(await admin<Gate[]>(`/gates/${selectedId}`));
    }, "Gate saved.");
  }
  async function saveIdentity(
    name: string,
    brand: Creator["brand"],
    creatorUrl: string,
    status: string,
  ) {
    await run(async () => {
      const normalizedUrl = normalizeCreatorUrl(creatorUrl);
      await admin(`/creators/${selectedId}`, "PATCH", {
        name,
        brand,
        creatorUrl: normalizedUrl || null,
        status,
      });
      setCreators(await admin<Creator[]>("/creators"));
    }, "Creator identity saved.");
  }
  async function saveContent(item: ContentRow, metaChanged: boolean) {
    await run(async () => {
      await admin(`/content/${selectedId}/${item.id}`, "PATCH", {
        title: item.title,
        description: item.description,
        rightsStatus: item.rights_status,
        processingStatus: item.processing_status,
        ...(metaChanged ? { meta: JSON.parse(item.structured_json) } : {}),
      });
      setContent(await admin<ContentRow[]>(`/content/${selectedId}`));
    }, "Content metadata saved.");
  }
  async function importAuthorizedContent(value: unknown) {
    await run(async () => {
      await admin(`/content/${selectedId}`, "POST", value);
      setContent(await admin<ContentRow[]>(`/content/${selectedId}`));
    }, "Authorized source metadata imported. Review its rights and details before promotion.");
  }
  async function reviewSpec(
    specId: string,
    reviewStatus: "approved" | "rejected",
  ) {
    await run(async () => {
      await admin(`/specs/${selectedId}/${specId}`, "PATCH", { reviewStatus });
      setSpecs(await admin<ProductSpecRow[]>(`/specs/${selectedId}`));
    }, `ProductSpec ${reviewStatus}. Review does not publish a product.`);
  }
  async function saveAgent(value: AgentConfig) {
    await run(async () => {
      await admin(`/agent/${selectedId}`, "PATCH", value);
      setAgentConfig(await admin<AgentConfig>(`/agent/${selectedId}`));
      setCreators(await admin<Creator[]>("/creators"));
    }, "Agent settings saved for future requests.");
  }
  async function refreshAgentOperations() {
    const [roles, tasks, findings] = await Promise.all([
      admin<{ roles: AgentRoleRow[] }>("/agent-roles"),
      admin<{ tasks: AgentTaskRow[] }>(`/agent-tasks/${selectedId}`),
      admin<{ findings: QualityFindingRow[] }>(`/data-quality/findings/${selectedId}`),
    ]);
    setAgentRoles(roles.roles);
    setAgentTasks(tasks.tasks);
    setQualityFindings(findings.findings);
  }
  async function submitAgentTask(roleKey: string) {
    await run(async () => {
      const defaultInput: Record<string, unknown> =
        roleKey === "creator_scout"
          ? { url: selected?.creatorUrl || "", category: selected?.category || "cooking" }
          : roleKey === "youtube_ingestion"
            ? { channelUrl: selected?.creatorUrl || "" }
            : roleKey === "cooking_assistant"
              ? { goal: "Find a quick recipe", ingredients: [], familySize: 2 }
              : roleKey === "ingredient_substitution"
                ? { ingredient: "potato" }
                : roleKey === "meal_planner"
                  ? { days: 3, familySize: 2 }
                  : {};
      await admin(`/agent-tasks/${selectedId}`, "POST", {
        roleKey,
        initiatorType: "admin",
        initiatorId: "admin-ui",
        input: { ...defaultInput, trigger: "admin-ui", requestedAt: new Date().toISOString() },
        idempotencyKey: `admin-ui:${roleKey}:${Date.now()}`,
      });
      await refreshAgentOperations();
    }, `${roleKey} task submitted.`);
  }
  async function runAgentTask(taskId: string) {
    await run(async () => {
      await admin(`/agent-tasks/${selectedId}/${taskId}/run`, "POST");
      await refreshAgentOperations();
    }, "Agent task dispatched. Review its result below when it completes.");
  }
  async function approveAgentTask(taskId: string, decision: "approved" | "rejected") {
    await run(async () => {
      await admin(`/agent-tasks/${selectedId}/${taskId}/approve`, "POST", {
        approverType: "admin",
        approverId: "admin-ui",
        decision,
      });
      await refreshAgentOperations();
    }, decision === "approved" ? "Approval recorded; the workflow will continue." : "Task rejected.");
  }
  async function runQualityCheck() {
    await run(async () => {
      await admin(`/data-quality/check`, "POST", {
        creatorId: selectedId,
        initiatorId: "admin-ui",
      });
      await refreshAgentOperations();
    }, "Data quality check completed.");
  }
  return (
    <div className="admin-shell">
      <header className="admin-header">
        <a href={selected ? `/creator/${selected.slug}` : "/"}>
          ← Creator page
        </a>
        <strong>
          Creator Agent Platform <span>ADMIN</span>
        </strong>
      </header>
      <div className="admin-layout">
        <aside className="admin-sidebar">
          <h2>Workspace</h2>
          <label>
            Local admin token (optional)
            <input
              type="password"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              placeholder="Cloudflare Access in production"
            />
          </label>
          {location.hostname === "localhost" || location.hostname === "127.0.0.1" ? (
            <small>Localhost owner access is enabled automatically.</small>
          ) : null}
          <button onClick={loadCreators}>Refresh creators</button>
          <div className="admin-creator-list">
            {creators.map((creator) => (
              <button
                className={creator.id === selectedId ? "active" : ""}
                key={creator.id}
                onClick={() => setSelectedId(creator.id)}
              >
                {creator.name}
                <small>
                  {creator.category} · {creator.status}
                </small>
              </button>
            ))}
          </div>
          <div className="admin-create">
            <h3>Build creator PWA</h3>
            <input
              type="text"
              inputMode="url"
              placeholder="YouTube / Instagram channel link"
              value={newCreatorUrl}
              onChange={(e) => setNewCreatorUrl(e.target.value)}
            />
            <small>
              One link creates the creator, starts the applicable agents, and
              prepares the public PWA.
            </small>
            <button disabled={busy} onClick={createCreator}>
              Build PWA
            </button>
          </div>
        </aside>
        <main className="admin-main">
          <div className="admin-title">
            <p className="eyebrow">INTERNAL CONTROL ROOM</p>
            <h1>{selected?.name || "Choose a creator"}</h1>
            <p>
              {selected?.slug || "Protected operator workspace"}
              {selected?.creatorUrl && (
                <>
                  {" · "}
                  <a href={selected.creatorUrl} target="_blank" rel="noopener noreferrer">
                    Creator URL ↗
                  </a>
                </>
              )}
            </p>
            {selected && (
              <a className="admin-open-creator" href={`/creator/${selected.slug}`}>
                Open creator page ↗
              </a>
            )}
          </div>
          {message && (
            <div className="admin-message" role="status">
              {message}
            </div>
          )}
          {selected && (
            <>
              <div className="admin-tabs">
                {(
                  [
                    "overview",
                    "content",
                    "agent",
                    "operations",
                    "scout",
                    "monetization",
                  ] as const
                ).map((item) => (
                  <button
                    key={item}
                    className={tab === item ? "active" : ""}
                    onClick={() => setTab(item)}
                  >
                    {item === "scout" ? "Creator research" : item}
                  </button>
                ))}
              </div>
              {tab === "overview" && (
                <div className="admin-panels">
                  {content.length === 0 && (
                    <section className="admin-next-action">
                      <p className="eyebrow">PWA SETUP</p>
                      <h2>{agentTasks.length ? "Your creator PWA is being prepared" : "Your creator PWA is waiting for a source"}</h2>
                      <p>
                        {agentTasks.length
                          ? "The applicable creator agents are running. Review their status in Operations; source connectors may still require authorization."
                          : "Paste a YouTube, Instagram, or other creator channel link to start the setup pipeline."}
                      </p>
                      <div className="admin-editor-actions">
                        <button onClick={() => setTab(agentTasks.length ? "operations" : "content")}>
                          {agentTasks.length ? "View setup agents" : "Add source content"}
                        </button>
                        <a href={`/creator/${selected.slug}`}>
                          Open creator PWA ↗
                        </a>
                      </div>
                    </section>
                  )}
                  <section>
                    <h2>Engagement</h2>
                    {metrics?.events.length ? (
                      metrics.events.map((event) => (
                        <p key={event.event_type}>
                          <span>{event.event_type}</span>
                          <strong>{event.count}</strong>
                        </p>
                      ))
                    ) : (
                      <p>No recorded events yet.</p>
                    )}
                  </section>
                  <section>
                    <h2>AI cost estimate</h2>
                    {metrics?.ai.length ? (
                      metrics.ai.map((row) => (
                        <p key={row.feature}>
                          <span>
                            {row.feature} · {row.requests} requests ·{" "}
                            {row.unpriced_requests || 0} unpriced
                          </span>
                          <strong>${Number(row.cost || 0).toFixed(4)}</strong>
                        </p>
                      ))
                    ) : (
                      <p>No AI usage recorded yet.</p>
                    )}
                  </section>
                  <section>
                    <h2>Confirmed revenue</h2>
                    {metrics?.confirmedRevenue.length ? (
                      metrics.confirmedRevenue.map((row) => (
                        <p key={`${row.source}-${row.currency}`}>
                          <span>{row.source}</span>
                          <strong>
                            {row.net} {row.currency}
                          </strong>
                        </p>
                      ))
                    ) : (
                      <p>No confirmed revenue. Pending entries are excluded.</p>
                    )}
                  </section>
                  <BrandEditor
                    key={selected.id}
                    creator={selected}
                    busy={busy}
                    onSave={saveIdentity}
                  />
                </div>
              )}
              {tab === "content" && (
                <div className="admin-panels">
                  <section className="content-setup-guide">
                    <p className="eyebrow">CONTENT SETUP</p>
                    <h2>How to populate this creator page</h2>
                    <ol>
                      <li>Paste the creator’s YouTube channel URL below.</li>
                      <li>Import the public video titles and links.</li>
                      <li>Open the creator page to see the imported sources.</li>
                      <li>Use authorized recipe metadata only when you have ingredients to add.</li>
                    </ol>
                  </section>
                  <section>
                    <h2>Import public YouTube videos</h2>
                    <p>
                      Paste the creator channel URL. This imports public video
                      titles, descriptions and links without copying recipe
                      text. Each run imports up to 25 videos.
                    </p>
                    <input
                      placeholder="https://www.youtube.com/@creator"
                      value={channelId}
                      onChange={(e) => setChannelId(e.target.value)}
                    />
                    <button
                      disabled={busy}
                      onClick={() =>
                        run(async () => {
                          const result = await admin<{
                            processed: number;
                            nextPageAvailable: boolean;
                          }>(`/youtube/${selectedId}/ingest`, "POST", {
                            channelUrl: channelId,
                          });
                          setContent(
                            await admin<ContentRow[]>(`/content/${selectedId}`),
                          );
                          setMessage(
                            `${result.processed} videos processed. More pages: ${result.nextPageAvailable}`,
                          );
                        }, "Ingestion complete")
                      }
                    >
                      Import public YouTube videos
                    </button>
                  </section>
                  <AuthorizedImport
                    busy={busy}
                    onCreate={importAuthorizedContent}
                  />
                  <section>
                    <h2>Content review</h2>
                    {content.map((item) => (
                      <ContentEditor
                        key={`${selectedId}-${item.id}`}
                        item={item}
                        slug={selected.slug}
                        busy={busy}
                        onSave={saveContent}
                      />
                    ))}
                  </section>
                </div>
              )}
              {tab === "agent" && (
                <div className="admin-panels">
                  {agentConfig && (
                    <AgentEditor
                      key={`${selectedId}-${agentConfig.promptVersion}`}
                      agent={agentConfig}
                      busy={busy}
                      onSave={saveAgent}
                    />
                  )}
                  <section>
                    <h2>Runtime boundaries</h2>
                    <p>
                      Knowledge search is required. The runtime caps output at
                      220 tokens and USD 0.05 per request even if a higher value
                      is saved.
                    </p>
                    <p>
                      Provider credentials and fallback are configured as Worker
                      secrets and environment variables.
                    </p>
                  </section>
                </div>
              )}
              {tab === "operations" && (
                <div className="admin-panels">
                  <section>
                    <h2>Specialist agent operations</h2>
                    <p>
                      These are creator-scoped, auditable tasks. Data Quality is
                      read-only; Content Librarian creates a reversible preview
                      and never changes public content without approval.
                    </p>
                    <div className="admin-editor-actions">
                      <button disabled={busy} onClick={runQualityCheck}>
                        Run data quality check
                      </button>
                      <button
                        disabled={busy}
                        onClick={() => submitAgentTask("content_librarian")}
                      >
                        Preview content organization
                      </button>
                      <button disabled={busy} onClick={refreshAgentOperations}>
                        Refresh operations
                      </button>
                    </div>
                  </section>
                  <section>
                    <h2>Registered roles</h2>
                    {agentRoles.length ? agentRoles.map((role) => (
                      <p key={role.id}>
                        <strong>{role.roleName}</strong> · {role.category}
                        {role.requiresApproval ? " · approval required" : ""}
                        <br />
                        <small>{role.description}</small>
                        <br />
                        <button disabled={busy} onClick={() => submitAgentTask(role.roleKey)}>
                          Submit safe task
                        </button>
                      </p>
                    )) : <p>No agent roles found. Apply migration 0003 to the active database.</p>}
                  </section>
                  <section>
                    <h2>Task history</h2>
                    {agentTasks.length ? agentTasks.map((task) => (
                      <div className="admin-spec" key={task.id}>
                        <p>
                          <strong>{task.roleId}</strong> · {task.status} · {task.createdAt}
                        </p>
                        {task.errorMessage && <p>{task.errorMessage}</p>}
                        {task.result && <pre>{JSON.stringify(task.result, null, 2)}</pre>}
                        {(task.status === "queued" || task.status === "awaiting_review") && (
                            <button disabled={busy} onClick={() => runAgentTask(task.id)}>
                              Dispatch task
                            </button>
                          )}
                        {task.status === "awaiting_review" && task.result && (
                          <>
                            <button disabled={busy} onClick={() => approveAgentTask(task.id, "approved")}>
                              Approve and continue
                            </button>
                            <button disabled={busy} onClick={() => approveAgentTask(task.id, "rejected")}>
                              Reject
                            </button>
                          </>
                        )}
                      </div>
                    )) : <p>No specialist tasks submitted yet.</p>}
                  </section>
                  <section>
                    <h2>Data quality findings</h2>
                    {qualityFindings.length ? qualityFindings.map((finding) => (
                      <div className="admin-spec" key={finding.id}>
                        <p>
                          <strong>{finding.severity}</strong> · {finding.findingType} · {finding.resourceId || finding.resourceType}
                        </p>
                        <small>{finding.suggestedAction || "Review finding."}</small>
                        <pre>{JSON.stringify(finding.details, null, 2)}</pre>
                      </div>
                    )) : <p>No findings recorded for this creator.</p>}
                  </section>
                </div>
              )}
              {tab === "scout" && (
                <div className="admin-panels">
                  <section>
                    <h2>Creator Scout</h2>
                    <p>
                      Work through the creator URL in three reviewable stages:
                      research the creator, understand audience and content,
                      then discover product opportunities. Generated claims
                      remain hypotheses until you verify them.
                    </p>
                    <div className="scout-steps">
                      <div className={`scout-step ${scout ? "complete" : "active"}`}>
                        <strong>1 · Research creator</strong>
                        <span>{scout ? "Complete — source run recorded." : "Start here: gather official or supplied source facts."}</span>
                      </div>
                      <div className={`scout-step ${scout ? "active" : ""}`}>
                        <strong>2 · Understand audience/content</strong>
                        <span>{scout ? "Now review the collected facts and inferred notes." : "Add sourced observations after the research run."}</span>
                      </div>
                      <div className={`scout-step ${scout ? "complete" : ""}`}>
                        <strong>3 · Discover opportunities</strong>
                        <span>{scout ? "Draft created — review it before engineering." : "Scout will draft a product hypothesis after review."}</span>
                      </div>
                    </div>
                    <input
                      type="text"
                      inputMode="url"
                      placeholder="Creator channel/profile URL"
                      value={researchUrl}
                      onChange={(e) => setResearchUrl(e.target.value)}
                    />
                    <label>
                      Audience signal (optional, sourced observation)
                      <textarea
                        value={audienceNotes}
                        onChange={(e) => setAudienceNotes(e.target.value)}
                        placeholder="Example: comments repeatedly ask for 20-minute family dinners."
                        rows={2}
                      />
                    </label>
                    <label>
                      Content theme (optional, sourced observation)
                      <textarea
                        value={contentNotes}
                        onChange={(e) => setContentNotes(e.target.value)}
                        placeholder="Example: recent public videos focus on vegetarian weeknight meals."
                        rows={2}
                      />
                    </label>
                    <button
                      disabled={busy}
                      onClick={() =>
                        run(async () => {
                          setScout(
                            await admin<ScoutResult>(
                              `/scout/${selectedId}`,
                              "POST",
                              {
                                url: normalizeCreatorUrl(researchUrl),
                                manualFacts: [
                                  ...(audienceNotes.trim()
                                    ? [
                                        {
                                          type: "audience_signal",
                                          value: audienceNotes.trim(),
                                          source: "operator supplied",
                                          sourceUrl: normalizeCreatorUrl(researchUrl),
                                          retrievedAt: new Date().toISOString(),
                                          confidence: 0.35,
                                          verificationStatus: "INFERRED",
                                        },
                                      ]
                                    : []),
                                  ...(contentNotes.trim()
                                    ? [
                                        {
                                          type: "content_theme",
                                          value: contentNotes.trim(),
                                          source: "operator supplied",
                                          sourceUrl: normalizeCreatorUrl(researchUrl),
                                          retrievedAt: new Date().toISOString(),
                                          confidence: 0.35,
                                          verificationStatus: "INFERRED",
                                        },
                                      ]
                                    : []),
                                ],
                              },
                            ),
                          );
                          setSpecs(
                            await admin<ProductSpecRow[]>(
                              `/specs/${selectedId}`,
                            ),
                          );
                        }, "Research run completed. Review every claim before use.")
                      }
                    >
                      Run research
                    </button>
                  </section>
                  {scout && (
                    <section>
                      <h2>Audience, content and opportunity review</h2>
                      <p>
                        Run: {scout.runId} · {scout.reviewStatus}
                      </p>
                      <div className="scout-review-grid">
                        <article>
                          <strong>Research creator</strong>
                          <span>{scout.facts.length} facts collected</span>
                        </article>
                        <article>
                          <strong>Understand audience/content</strong>
                          <span>
                            {String(
                              (scout.opportunity as { audienceSummary?: string })
                                ?.audienceSummary ||
                                "No audience summary yet.",
                            )}
                          </span>
                          <span>
                            {String(
                              (scout.opportunity as { contentSummary?: string })
                                ?.contentSummary ||
                                "No content summary yet.",
                            )}
                          </span>
                        </article>
                        <article>
                          <strong>Discover opportunities</strong>
                          <span>
                            {String(
                              (scout.opportunity as { proposedProduct?: string })
                                ?.proposedProduct || "Draft pending",
                            )}
                          </span>
                        </article>
                      </div>
                      <pre>
                        {JSON.stringify(scout.providerResults, null, 2)}
                      </pre>
                      <details>
                        <summary>Collected facts</summary>
                        <pre>{JSON.stringify(scout.facts, null, 2)}</pre>
                      </details>
                      <pre>{JSON.stringify(scout.productSpec, null, 2)}</pre>
                      <div className="scout-next-step">
                        <strong>What happens next?</strong>
                        <p>
                          Scout only creates research and a draft proposal. To
                          make this creator page useful, review the proposal,
                          add approved source metadata, then open the creator
                          page.
                        </p>
                        <div className="admin-editor-actions">
                          <button onClick={() => setTab("content")}>
                            1. Add approved content
                          </button>
                          <a href={`/creator/${selected.slug}`}>
                            2. Open creator page ↗
                          </a>
                        </div>
                      </div>
                    </section>
                  )}
                  <section>
                    <h2>ProductSpec decisions</h2>
                    {specs.length ? (
                      specs.map((spec) => (
                        <div className="admin-spec" key={spec.id}>
                          <p>
                            <strong>Version {spec.version}</strong> ·{" "}
                            {spec.reviewStatus} · {spec.createdAt}
                          </p>
                          <details>
                            <summary>View proposal</summary>
                            <pre>{JSON.stringify(spec.spec, null, 2)}</pre>
                          </details>
                          {spec.reviewStatus === "pending_review" && (
                            <div className="admin-editor-actions">
                              <button
                                disabled={busy}
                                onClick={() => reviewSpec(spec.id, "approved")}
                              >
                                Approve for engineering review
                              </button>
                              <button
                                disabled={busy}
                                onClick={() => reviewSpec(spec.id, "rejected")}
                              >
                                Reject
                              </button>
                            </div>
                          )}
                        </div>
                      ))
                    ) : (
                      <p>
                        No ProductSpecs yet. Run Scout after adding approved
                        evidence.
                      </p>
                    )}
                  </section>
                </div>
              )}
              {tab === "monetization" && (
                <div className="admin-panels">
                  <section>
                    <h2>Feature gates</h2>
                    {gates.map((gate) => (
                      <div className="gate-row" key={gate.feature}>
                        <strong>{gate.feature}</strong>
                        <label>
                          Enabled
                          <input
                            type="checkbox"
                            checked={!!gate.enabled}
                            onChange={(e) =>
                              setGates(
                                gates.map((row) =>
                                  row.feature === gate.feature
                                    ? {
                                        ...row,
                                        enabled: Number(e.target.checked),
                                      }
                                    : row,
                                ),
                              )
                            }
                          />
                        </label>
                        <label>
                          Entitlement
                          <select
                            value={gate.required_entitlement || ""}
                            onChange={(e) =>
                              setGates(
                                gates.map((row) =>
                                  row.feature === gate.feature
                                    ? {
                                        ...row,
                                        required_entitlement:
                                          e.target.value || null,
                                      }
                                    : row,
                                ),
                              )
                            }
                          >
                            <option value="">None</option>
                            <option value="premium">Premium</option>
                          </select>
                        </label>
                        <label>
                          Free uses
                          <input
                            type="number"
                            min="0"
                            value={gate.free_usage_limit ?? ""}
                            onChange={(e) =>
                              setGates(
                                gates.map((row) =>
                                  row.feature === gate.feature
                                    ? {
                                        ...row,
                                        free_usage_limit:
                                          e.target.value === ""
                                            ? null
                                            : Number(e.target.value),
                                      }
                                    : row,
                                ),
                              )
                            }
                          />
                        </label>
                        <label>
                          Trial
                          <input
                            type="number"
                            min="0"
                            value={gate.trial_usage}
                            onChange={(e) =>
                              setGates(
                                gates.map((row) =>
                                  row.feature === gate.feature
                                    ? {
                                        ...row,
                                        trial_usage: Number(e.target.value),
                                      }
                                    : row,
                                ),
                              )
                            }
                          />
                        </label>
                        <label>
                          Reset
                          <select
                            value={gate.reset_period}
                            onChange={(e) =>
                              setGates(
                                gates.map((row) =>
                                  row.feature === gate.feature
                                    ? { ...row, reset_period: e.target.value }
                                    : row,
                                ),
                              )
                            }
                          >
                            <option value="day">Daily</option>
                            <option value="lifetime">Lifetime</option>
                          </select>
                        </label>
                        <button disabled={busy} onClick={() => saveGate(gate)}>
                          Save
                        </button>
                      </div>
                    ))}
                  </section>
                  <section>
                    <h2>Gate experiments</h2>
                    <p>
                      Assignments stay stable per user and creator. Drafts do
                      not affect users.
                    </p>
                    <div className="admin-editor-row">
                      <label>
                        Feature
                        <select
                          value={experimentFeature}
                          onChange={(e) => setExperimentFeature(e.target.value)}
                        >
                          <option value="AI_VOICE">Voice trial uses</option>
                          <option value="AI_TEXT">Daily AI text uses</option>
                          <option value="MEAL_PLAN">Free plan days</option>
                        </select>
                      </label>
                      <label>
                        Control
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={experimentControl}
                          onChange={(e) =>
                            setExperimentControl(Number(e.target.value))
                          }
                        />
                      </label>
                      <label>
                        Variant
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={experimentVariant}
                          onChange={(e) =>
                            setExperimentVariant(Number(e.target.value))
                          }
                        />
                      </label>
                    </div>
                    <button disabled={busy} onClick={createExperiment}>
                      Create draft
                    </button>
                    {experiments.map((experiment) => (
                      <div className="admin-spec" key={experiment.id}>
                        <p>
                          <strong>{experiment.feature}</strong> ·{" "}
                          {experiment.status}
                        </p>
                        <small>
                          {experiment.variants
                            .map(
                              (variant) =>
                                `${variant.key}: ${variant.freeUsageLimit ?? variant.trialUsage ?? 0}`,
                            )
                            .join(" · ")}
                        </small>
                        <div className="admin-editor-actions">
                          {experiment.status !== "active" &&
                            experiment.status !== "complete" && (
                              <button
                                disabled={busy}
                                onClick={() =>
                                  updateExperiment(experiment.id, "active")
                                }
                              >
                                Activate
                              </button>
                            )}
                          {experiment.status === "active" && (
                            <button
                              disabled={busy}
                              onClick={() =>
                                updateExperiment(experiment.id, "paused")
                              }
                            >
                              Pause
                            </button>
                          )}
                          {experiment.status !== "complete" && (
                            <button
                              disabled={busy}
                              onClick={() =>
                                updateExperiment(experiment.id, "complete")
                              }
                            >
                              Complete
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </section>
                  <section>
                    <h2>Sponsorship campaigns</h2>
                    <p>
                      Campaigns are drafts until placement, disclosure, and
                      commercial terms are reviewed.
                    </p>
                    <label>
                      Brand
                      <input
                        value={campaignBrand}
                        onChange={(e) => setCampaignBrand(e.target.value)}
                      />
                    </label>
                    <label>
                      Placement ID
                      <input
                        value={campaignPlacement}
                        onChange={(e) => setCampaignPlacement(e.target.value)}
                        placeholder="plan_summary"
                      />
                    </label>
                    <button disabled={busy} onClick={createCampaign}>
                      Create draft
                    </button>
                    {campaigns.map((campaign) => (
                      <div className="admin-spec" key={campaign.id}>
                        <p>
                          <strong>{campaign.brand}</strong> · {campaign.status}
                        </p>
                        <small>{campaign.placements.join(", ")}</small>
                        <div className="admin-editor-actions">
                          {campaign.status !== "active" &&
                            campaign.status !== "complete" && (
                              <button
                                disabled={busy}
                                onClick={() =>
                                  updateCampaign(campaign.id, "active")
                                }
                              >
                                Activate
                              </button>
                            )}
                          {campaign.status === "active" && (
                            <button
                              disabled={busy}
                              onClick={() =>
                                updateCampaign(campaign.id, "paused")
                              }
                            >
                              Pause
                            </button>
                          )}
                          {campaign.status !== "complete" && (
                            <button
                              disabled={busy}
                              onClick={() =>
                                updateCampaign(campaign.id, "complete")
                              }
                            >
                              Complete
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </section>
                  <section>
                    <h2>Affiliate redirect</h2>
                    <p>
                      Destinations must be HTTPS. Disclose affiliate
                      relationships in consumer placements.
                    </p>
                    <input
                      placeholder="Link slug"
                      value={affiliateSlug}
                      onChange={(e) => setAffiliateSlug(e.target.value)}
                    />
                    <input
                      placeholder="https://approved-shop.example/item"
                      value={affiliateUrl}
                      onChange={(e) => setAffiliateUrl(e.target.value)}
                    />
                    <button
                      disabled={busy}
                      onClick={() =>
                        run(
                          () =>
                            admin(`/affiliate/${selectedId}`, "POST", {
                              slug: affiliateSlug,
                              destinationUrl: affiliateUrl,
                              label: affiliateSlug,
                            }),
                          "Affiliate redirect created. Add an explicit disclosure where shown.",
                        )
                      }
                    >
                      Create redirect
                    </button>
                    {affiliates.map((link) => (
                      <div className="admin-spec" key={link.id}>
                        <p>
                          <strong>{link.label}</strong> ·{" "}
                          {link.destination_host}
                        </p>
                        <a
                          href={`/go/${selected.slug}/${link.slug}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          /go/{selected.slug}/{link.slug} ↗
                        </a>
                        <small>
                          {" "}
                          · {link.clicks} clicks · Commission requires provider
                          confirmation
                        </small>
                      </div>
                    ))}
                    <button
                      disabled={busy}
                      onClick={() =>
                        run(
                          async () =>
                            setAffiliates(
                              await admin<AffiliateRow[]>(
                                `/affiliate/${selectedId}`,
                              ),
                            ),
                          "Affiliate links refreshed.",
                        )
                      }
                    >
                      Refresh links
                    </button>
                  </section>
                  <section>
                    <h2>Revenue ledger</h2>
                    <p>
                      Only provider-confirmed or paid entries count in the
                      revenue summary. Clicks and draft campaigns are excluded.
                    </p>
                    {revenue.length ? (
                      revenue.map((entry) => (
                        <div className="admin-spec" key={entry.id}>
                          <p>
                            <strong>{entry.source}</strong> · {entry.status}
                          </p>
                          <small>
                            {entry.net_amount} {entry.currency} net ·{" "}
                            {entry.occurred_at}
                          </small>
                        </div>
                      ))
                    ) : (
                      <p>No revenue entries.</p>
                    )}
                  </section>
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
