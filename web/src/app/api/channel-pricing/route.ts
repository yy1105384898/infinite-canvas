import type { NextRequest } from "next/server";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const cacheTtlMs = 60_000;
const memoryCache = new Map<string, { fetchedAt: number; payload: unknown }>();

export async function GET(request: NextRequest) {
    const baseUrl = request.nextUrl.searchParams.get("baseUrl") || "";
    const pricingUrl = pricingApiUrl(baseUrl);
    if (!pricingUrl) return Response.json({ data: [] });
    if (!(await isAllowedPricingUrl(pricingUrl))) return Response.json({ data: [] });

    const cached = memoryCache.get(pricingUrl);
    if (cached && Date.now() - cached.fetchedAt < cacheTtlMs) return Response.json(cached.payload);

    try {
        const response = await fetch(pricingUrl, { cache: "no-store" });
        if (!response.ok) return Response.json({ data: [] }, { status: response.status });
        const payload = await response.json();
        memoryCache.set(pricingUrl, { fetchedAt: Date.now(), payload });
        return Response.json(payload);
    } catch {
        return Response.json({ data: [] }, { status: 502 });
    }
}

async function isAllowedPricingUrl(value: string) {
    try {
        const url = new URL(value);
        const addresses = isIP(url.hostname) ? [{ address: url.hostname }] : await lookup(url.hostname, { all: true });
        return addresses.every((item) => !isPrivateAddress(item.address));
    } catch {
        return false;
    }
}

function isPrivateAddress(value: string) {
    if (value === "localhost") return true;
    const family = isIP(value);
    if (family === 6) {
        const lower = value.toLowerCase();
        return lower === "::1" || lower.startsWith("fc") || lower.startsWith("fd") || lower.startsWith("fe80:");
    }
    if (family !== 4) return true;
    const parts = value.split(".").map(Number);
    const [a, b] = parts;
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || (a === 198 && (b === 18 || b === 19));
}

function pricingApiUrl(value: string) {
    try {
        const url = new URL(value.trim());
        if (url.protocol !== "http:" && url.protocol !== "https:") return "";
        url.pathname = url.pathname
            .replace(/\/+$/, "")
            .replace(/\/v1$/i, "")
            .replace(/\/api\/v3$/i, "")
            .replace(/\/api\/plan\/v3$/i, "");
        url.search = "";
        url.hash = "";
        return `${url.toString().replace(/\/+$/, "")}/api/pricing`;
    } catch {
        return "";
    }
}
