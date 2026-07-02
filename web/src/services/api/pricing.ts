import { modelOptionName, resolveModelChannel, type AiConfig } from "@/stores/use-config-store";

export type PricingBillingMode = "per_second" | "per_request" | "tiered_expr" | "ratio";

export type ModelPricingItem = {
    model_name: string;
    description?: string;
    tags?: string;
    quota_type?: number;
    model_ratio?: number;
    completion_ratio?: number;
    cache_ratio?: number;
    create_cache_ratio?: number;
    model_price?: number;
    billing_mode?: string;
    request_unit?: string;
    video_ui_params?: {
        apiMode?: string;
        poll?: { delayMs?: number; maxAttempts?: number };
        params?: {
            duration?: { min?: number; max?: number; numericOptions?: number[] };
            resolution?: { options?: Array<{ label?: string; value?: string }> };
            ratio?: { options?: Array<{ label?: string; value?: string }> };
            frameInputs?: { enabled?: boolean; hint?: string };
        };
    };
};

export type ChannelPricingSnapshot = {
    autoGroups: string[];
    items: Record<string, ModelPricingItem>;
    loadedAt: number;
};

const cacheTtlMs = 60_000;
const snapshotCache = new Map<string, { fetchedAt: number; promise?: Promise<ChannelPricingSnapshot>; snapshot?: ChannelPricingSnapshot }>();

export async function fetchChannelPricingSnapshot(baseUrl: string) {
    const key = baseUrl.trim();
    if (!key) return emptySnapshot();
    const cached = snapshotCache.get(key);
    if (cached?.snapshot && Date.now() - cached.fetchedAt < cacheTtlMs) return cached.snapshot;
    if (cached?.promise) return cached.promise;

    const promise = fetch(`/api/channel-pricing?baseUrl=${encodeURIComponent(key)}`, { cache: "no-store" })
        .then(async (response) => {
            if (!response.ok) throw new Error("价格读取失败");
            return normalizePricingPayload(await response.json());
        })
        .catch(() => emptySnapshot())
        .then((snapshot) => {
            snapshotCache.set(key, { fetchedAt: Date.now(), snapshot });
            return snapshot;
        });
    snapshotCache.set(key, { fetchedAt: Date.now(), promise });
    return promise;
}

export function findModelPricing(snapshot: ChannelPricingSnapshot | undefined, model: string) {
    if (!snapshot) return null;
    return snapshot.items[normalizeModelName(model)] || null;
}

export function pricingForConfig(snapshot: ChannelPricingSnapshot | undefined, config: AiConfig, model = config.model) {
    return findModelPricing(snapshot, modelOptionName(model));
}

export function pricingChannelKey(config: AiConfig, model = config.model) {
    return resolveModelChannel(config, model).baseUrl.trim();
}

export function modelPricingLabel(item: ModelPricingItem | null | undefined) {
    if (!item) return "";
    const price = Number(item.model_price || 0);
    const mode = normalizeBillingMode(item);
    if (price > 0 && mode === "per_second") return `¥${formatMoney(price)}/秒`;
    if (price > 0 && mode === "per_request") return `¥${formatMoney(price)}/${requestUnitLabel(item.request_unit)}`;
    if (price > 0) return `¥${formatMoney(price)}`;
    const ratio = Number(item.model_ratio || 0);
    const completion = Number(item.completion_ratio || 0);
    if (ratio > 0 && completion > 0 && completion !== ratio) return `倍率 ${formatRatio(ratio)} / ${formatRatio(completion)}`;
    if (ratio > 0) return `倍率 ${formatRatio(ratio)}`;
    return "";
}

export function modelRequestCostLabel(item: ModelPricingItem | null | undefined, options: { durationSeconds?: string | number; count?: string | number } = {}) {
    if (!item) return "";
    const price = Number(item.model_price || 0);
    const count = Math.max(1, Math.floor(Math.abs(Number(options.count)) || 1));
    if (price > 0 && normalizeBillingMode(item) === "per_second") {
        const seconds = Math.max(1, Math.floor(Number(options.durationSeconds) > 0 ? Number(options.durationSeconds) : 5));
        return `¥${formatMoney(price * seconds * count)} (${seconds}秒${count > 1 ? ` x${count}` : ""})`;
    }
    if (price > 0) return `¥${formatMoney(price * count)}`;
    return modelPricingLabel(item);
}

export function normalizeBillingMode(item: ModelPricingItem): PricingBillingMode {
    const mode = item.billing_mode?.trim();
    if (mode === "per_second" || mode === "per-second") return "per_second";
    if (mode === "per_request" || mode === "per-request") return "per_request";
    if (mode === "tiered_expr") return "tiered_expr";
    if (Number(item.model_price || 0) > 0 || item.quota_type === 1) return "per_request";
    return "ratio";
}

export function emptySnapshot(): ChannelPricingSnapshot {
    return { autoGroups: [], items: {}, loadedAt: Date.now() };
}

function normalizePricingPayload(payload: unknown): ChannelPricingSnapshot {
    const record = isRecord(payload) ? payload : {};
    const data = Array.isArray(record.data) ? record.data : [];
    const items: Record<string, ModelPricingItem> = {};
    for (const item of data) {
        if (!isRecord(item) || typeof item.model_name !== "string" || !item.model_name.trim()) continue;
        items[normalizeModelName(item.model_name)] = item as ModelPricingItem;
    }
    return {
        autoGroups: Array.isArray(record.auto_groups) ? record.auto_groups.filter((item): item is string => typeof item === "string") : [],
        items,
        loadedAt: Date.now(),
    };
}

function normalizeModelName(value: string) {
    return modelOptionName(value).trim().toLowerCase();
}

function requestUnitLabel(value: string | undefined) {
    if (value === "task") return "任务";
    return "次";
}

function formatMoney(value: number) {
    return value.toFixed(value >= 10 ? 2 : 4).replace(/0+$/, "").replace(/\.$/, "");
}

function formatRatio(value: number) {
    return value.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
