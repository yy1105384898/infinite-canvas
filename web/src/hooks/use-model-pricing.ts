"use client";

import { useEffect, useState } from "react";

import { fetchChannelPricingSnapshot, findModelPricing, pricingChannelKey, type ChannelPricingSnapshot, type ModelPricingItem } from "@/services/api/pricing";
import type { AiConfig } from "@/stores/use-config-store";

export function useModelPricing(config: AiConfig, model = config.model) {
    const baseUrl = pricingChannelKey(config, model);
    const [snapshot, setSnapshot] = useState<ChannelPricingSnapshot | null>(null);

    useEffect(() => {
        let cancelled = false;
        setSnapshot(null);
        if (!baseUrl) return;
        fetchChannelPricingSnapshot(baseUrl).then((value) => {
            if (!cancelled) setSnapshot(value);
        });
        return () => {
            cancelled = true;
        };
    }, [baseUrl]);

    return {
        snapshot,
        item: findModelPricing(snapshot || undefined, model) as ModelPricingItem | null,
    };
}
