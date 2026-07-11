import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Prompt = {
    id: string;
    title: string;
    coverUrl: string;
    videoUrl?: string;
    modality?: string;
    prompt: string;
    tags: string[];
    category: string;
    githubUrl: string;
    preview: string;
    createdAt: string;
    updatedAt: string;
};

type PromptCategory = {
    category: string;
    githubUrl: string;
    build: () => Promise<Omit<Prompt, "category" | "githubUrl">[]>;
};

const gptImage2RawBase = "https://raw.githubusercontent.com/EvoLinkAI/awesome-gpt-image-2-API-and-Prompts/main";
const awesomeGptImageRawBase = "https://raw.githubusercontent.com/ZeroLu/awesome-gpt-image/main";
const awesomeGpt4oImagePromptsBase = "https://raw.githubusercontent.com/ImgEdify/Awesome-GPT4o-Image-Prompts/main";
const youMindGptImage2RawBase = "https://raw.githubusercontent.com/YouMind-OpenLab/awesome-gpt-image-2/main";
const youMindNanoBananaProRawBase = "https://raw.githubusercontent.com/YouMind-OpenLab/awesome-nano-banana-pro-prompts/main";
const youMindSeedance2RawBase = "https://raw.githubusercontent.com/YouMind-OpenLab/awesome-seedance-2-prompts/main";
const davidWuGptImage2RawBase = "https://raw.githubusercontent.com/davidwuw0811-boop/awesome-gpt-image2-prompts/main";
const zhangSora2RawBase = "https://raw.githubusercontent.com/zhangchenchen/awesome_sora2_prompt/main";
const awesomeSora2RawBase = "https://raw.githubusercontent.com/ZeroLu/awesome-sora2/main";
const lanshuVideoKitRawBase = "https://raw.githubusercontent.com/cclank/lanshu-awesome-ai-video-kit/main";
const cangyuanPromptApi = "https://canvas.cangyuansuanli.cn/api/prompts";
const gptImage2CaseFiles = ["README.md", "cases/ad-creative.md", "cases/character.md", "cases/comparison.md", "cases/ecommerce.md", "cases/portrait.md", "cases/poster.md", "cases/ui.md"];
const zhangSora2PromptFiles = ["prompts/official-prompts.md", "prompts/sora2-viral-prompts.md", "prompts/hyperrealism-landscapes.md"];
const cacheTtlMs = 1000 * 60 * 60;

const categories: PromptCategory[] = [
    { category: "gpt-image-2-prompts", githubUrl: "https://github.com/EvoLinkAI/awesome-gpt-image-2-API-and-Prompts", build: buildGptImage2Prompts },
    { category: "awesome-gpt-image", githubUrl: "https://github.com/ZeroLu/awesome-gpt-image", build: buildAwesomeGptImagePrompts },
    { category: "awesome-gpt4o-image-prompts", githubUrl: "https://github.com/ImgEdify/Awesome-GPT4o-Image-Prompts", build: buildAwesomeGpt4oImagePrompts },
    { category: "youmind-gpt-image-2", githubUrl: "https://github.com/YouMind-OpenLab/awesome-gpt-image-2", build: () => buildYouMindPrompts(youMindGptImage2RawBase, "youmind-gpt-image-2", "gpt-image-2") },
    { category: "youmind-nano-banana-pro", githubUrl: "https://github.com/YouMind-OpenLab/awesome-nano-banana-pro-prompts", build: () => buildYouMindPrompts(youMindNanoBananaProRawBase, "youmind-nano-banana-pro", "nano-banana-pro") },
    { category: "youmind-seedance-2", githubUrl: "https://github.com/YouMind-OpenLab/awesome-seedance-2-prompts", build: buildYouMindSeedance2Prompts },
    { category: "davidwu-gpt-image2-prompts", githubUrl: "https://github.com/davidwuw0811-boop/awesome-gpt-image2-prompts", build: buildDavidWuGptImage2Prompts },
    { category: "awesome-sora2", githubUrl: "https://github.com/ZeroLu/awesome-sora2", build: buildAwesomeSora2Prompts },
    { category: "awesome-sora2-prompts", githubUrl: "https://github.com/zhangchenchen/awesome_sora2_prompt", build: buildZhangSora2Prompts },
    { category: "lanshu-ai-video-kit", githubUrl: "https://github.com/cclank/lanshu-awesome-ai-video-kit", build: buildLanshuVideoKitPrompts },
    { category: "lanshu-cross-model-matrix", githubUrl: "https://github.com/cclank/lanshu-awesome-ai-video-kit", build: buildLanshuCrossModelPrompts },
];

let memoryCache: { items: Prompt[]; fetchedAt: number } | null = null;
let loadingPrompts: Promise<Prompt[]> | null = null;

export async function GET(request: NextRequest) {
    const params = request.nextUrl.searchParams;
    const keyword = (params.get("keyword") || "").trim().toLowerCase();
    const tags = params.getAll("tag").filter(Boolean);
    const category = params.get("category") || "";
    const modality = params.get("modality") || "";
    const page = Math.max(1, Number(params.get("page")) || 1);
    const pageSize = Math.max(1, Math.min(100, Number(params.get("pageSize")) || 20));

    const mirrored = await fetchCangyuanPromptPage({ keyword, tags, category, modality, page, pageSize });
    if (mirrored) return Response.json(mirrored);

    const items = await getPrompts();
    const withoutTagFilter = filterPrompts(items, { keyword, category, modality, tags: [] });
    const filtered = filterPrompts(items, { keyword, category, modality, tags });

    return Response.json({
        items: filtered.slice((page - 1) * pageSize, page * pageSize),
        tags: collectTags(withoutTagFilter),
        categories: collectCategories(items),
        total: filtered.length,
    });
}

async function getPrompts() {
    if (memoryCache && Date.now() - memoryCache.fetchedAt < cacheTtlMs) return memoryCache.items;
    if (loadingPrompts) return loadingPrompts;
    loadingPrompts = loadPrompts().finally(() => {
        loadingPrompts = null;
    });
    return loadingPrompts;
}

async function loadPrompts() {
    const mirrored = await loadCangyuanPrompts();
    if (mirrored.length) {
        memoryCache = { items: mirrored, fetchedAt: Date.now() };
        return mirrored;
    }

    const settled = await Promise.all(
        categories.map(async (category) => {
            try {
                const items = await category.build();
                return items.map((item) => ({ ...item, category: category.category, githubUrl: category.githubUrl }));
            } catch {
                return [];
            }
        }),
    );
    const items = settled.flat();
    memoryCache = { items, fetchedAt: Date.now() };
    return items;
}

async function loadCangyuanPrompts() {
    const pageSize = 100;
    const items: Prompt[] = [];
    let total = 0;

    for (let page = 1; page <= 30; page++) {
        const url = `${cangyuanPromptApi}?page=${page}&pageSize=${pageSize}`;
        const response = await fetch(url, { cache: "no-store" });
        if (!response.ok) throw new Error("提示词中心同步失败");
        const data = (await response.json()) as { total?: number; items?: Array<Partial<Prompt>> };
        total = data.total || total;
        const pageItems = (data.items || []).map(normalizeRemotePrompt).filter((item): item is Prompt => Boolean(item));
        items.push(...pageItems);
        if (!pageItems.length || (total && items.length >= total)) break;
    }

    return items;
}

function normalizeRemotePrompt(item: Partial<Prompt>) {
    if (!item.id || !item.title || !item.prompt || !item.category || !item.githubUrl) return null;
    return {
        id: item.id,
        title: item.title,
        coverUrl: item.coverUrl || "",
        videoUrl: item.videoUrl || "",
        modality: item.modality || "",
        prompt: item.prompt,
        tags: Array.isArray(item.tags) ? item.tags.filter(Boolean) : [],
        category: item.category,
        githubUrl: item.githubUrl,
        preview: item.preview || "",
        createdAt: item.createdAt || "",
        updatedAt: item.updatedAt || "",
    };
}

async function fetchCangyuanPromptPage(options: { keyword: string; tags: string[]; category: string; modality: string; page: number; pageSize: number }) {
    if (options.modality === "text") return null;

    try {
        const params = new URLSearchParams({
            page: String(options.page),
            pageSize: String(options.pageSize),
        });
        if (options.keyword) params.set("keyword", options.keyword);
        if (isActiveOption(options.category)) params.set("category", options.category);
        if (options.modality) params.set("modality", options.modality);
        options.tags.forEach((tag) => params.append("tag", tag));

        const response = await fetch(`${cangyuanPromptApi}?${params}`, { cache: "no-store" });
        if (!response.ok) return null;
        const data = (await response.json()) as { total?: number; items?: Array<Partial<Prompt>>; tags?: string[]; categories?: string[] };

        return {
            items: (data.items || []).map(normalizeRemotePrompt).filter((item): item is Prompt => Boolean(item)),
            tags: data.tags || [],
            categories: data.categories || [],
            total: data.total || 0,
        };
    } catch {
        return null;
    }
}

function filterPrompts(items: Prompt[], options: { keyword: string; category: string; modality: string; tags: string[] }) {
    return items.filter((item) => {
        if (isActiveOption(options.category) && item.category !== options.category) return false;
        if (!matchesModality(item, options.modality)) return false;
        if (options.tags.length && !options.tags.some((tag) => item.tags.includes(tag))) return false;
        if (!options.keyword) return true;
        return [item.title, item.prompt, item.category, ...item.tags].join(" ").toLowerCase().includes(options.keyword);
    });
}

function matchesModality(item: Prompt, modality: string) {
    if (!isActiveOption(modality)) return true;
    if (modality === "text") return !item.coverUrl && !item.videoUrl;
    if (modality === "image") return item.modality === "image" || (Boolean(item.coverUrl) && !item.videoUrl);
    if (modality === "video") return item.modality === "video" || Boolean(item.videoUrl);
    return true;
}

async function buildGptImage2Prompts() {
    const data = (await fetchJson<{ records?: Array<{ title?: string; tweet_url?: string; image_dir?: string; category?: string; added_at?: string }> }>(gptImage2RawBase, "data/ingested_tweets.json")).records || [];
    const cases = new Map<string, string>();
    const markdowns = await Promise.all(gptImage2CaseFiles.map((file) => fetchText(gptImage2RawBase, file)));
    markdowns.forEach((markdown) => collectGptImage2Cases(cases, markdown));
    const items: Omit<Prompt, "category" | "githubUrl">[] = [];
    data.forEach((item) => {
        const prompt = cases.get(item.tweet_url || "");
        if (!item.title || !prompt || !item.image_dir) return;
        const image = `${gptImage2RawBase}/${item.image_dir}/output.jpg`;
        items.push({
            id: `gpt-image-2-prompts-${leftPad(items.length + 1)}`,
            title: item.title,
            coverUrl: image,
            prompt,
            tags: tagsFromCategory(item.category || ""),
            preview: markdownPreview([image]),
            createdAt: item.added_at || "",
            updatedAt: item.added_at || "",
        });
    });
    return items;
}

function collectGptImage2Cases(cases: Map<string, string>, markdown: string) {
    for (const match of markdown.matchAll(/### Case \d+: \[[^\]]+]\(([^)]+)\).*?\*\*Prompt:\*\*\s*\r?\n\s*```[\w-]*\r?\n(.*?)\r?\n```/gs)) {
        cases.set(match[1], match[2].trim());
    }
}

async function buildAwesomeGptImagePrompts() {
    const markdown = await fetchText(awesomeGptImageRawBase, "README.zh-CN.md");
    const items: Omit<Prompt, "category" | "githubUrl">[] = [];
    for (const section of splitBeforeHeading(markdown, "## ")) {
        const tags = tagsFromHeading(firstMatch(section, /^##\s+(.+)$/m));
        for (const block of splitBeforeHeading(section, "### ")) {
            const title = firstMatch(block, /^###\s+(.+)$/m)
                .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
                .trim();
            const prompt = firstMatch(block, /\*\*提示词:\*\*\s*\r?\n\s*```[\w-]*\r?\n(.*?)\r?\n```/s).trim();
            if (!title || !prompt) continue;
            const images = extractMarkdownImages(awesomeGptImageRawBase, block);
            items.push(defaultPrompt(`awesome-gpt-image-${leftPad(items.length + 1)}`, title, prompt, images[0] || "", tags, markdownPreview(images)));
        }
    }
    return items;
}

async function buildAwesomeGpt4oImagePrompts() {
    const markdown = await fetchText(awesomeGpt4oImagePromptsBase, "README.zh-CN.md");
    const items: Omit<Prompt, "category" | "githubUrl">[] = [];
    for (const block of splitBeforeHeading(markdown, "### ")) {
        const title = firstMatch(block, /^###\s+(.+)$/m).trim();
        const prompt = firstMatch(block, /- \*\*提示词文本：\*\*\s*`(.*?)`/s).trim();
        if (!title || !prompt) continue;
        const images = extractMarkdownImages(awesomeGpt4oImagePromptsBase, block);
        items.push(defaultPrompt(`awesome-gpt4o-image-prompts-${leftPad(items.length + 1)}`, title, prompt, images[0] || "", ["gpt4o"], markdownPreview(images)));
    }
    return items;
}

async function buildYouMindPrompts(baseUrl: string, idPrefix: string, modelTag: string) {
    const markdown = await fetchText(baseUrl, "README_zh.md");
    const items: Omit<Prompt, "category" | "githubUrl">[] = [];
    for (const block of splitBeforeHeading(markdown, "### ")) {
        const title = firstMatch(block, /^###\s+No\.\s*\d+:\s*(.+)$/m).trim();
        const prompt = firstMatch(block, /#### .*?提示词\s*\r?\n\s*```[\w-]*\r?\n(.*?)\r?\n```/s).trim();
        if (!title || !prompt) continue;
        const images = extractMarkdownImages(baseUrl, block);
        items.push(defaultPrompt(`${idPrefix}-${leftPad(items.length + 1)}`, title, prompt, images[0] || "", youMindTags(title, modelTag), markdownPreview(images)));
    }
    return items;
}

async function buildYouMindSeedance2Prompts() {
    const markdown = await fetchText(youMindSeedance2RawBase, "README_zh.md");
    const items: Omit<Prompt, "category" | "githubUrl">[] = [];
    for (const block of splitBeforeHeading(markdown, "### ")) {
        const title = firstMatch(block, /^###\s+(?:No\.\s*\d+:\s*)?(.+)$/m).trim();
        const prompt = firstMatch(block, /#### .*?提示词\s*\r?\n\s*```[\w-]*\r?\n(.*?)\r?\n```/s).trim();
        if (!title || !prompt) continue;
        const images = contentImages(youMindSeedance2RawBase, block);
        const description = cleanMarkdownText(firstMatch(block, /#### .*?描述\s*\r?\n([\s\S]*?)(?=\r?\n#### )/));
        items.push(defaultPrompt(`youmind-seedance-2-${leftPad(items.length + 1)}`, title, prompt, images[0] || "", ["seedance-2.0", "video"], [description, markdownPreview(images)].filter(Boolean).join("\n\n")));
    }
    return items;
}

async function buildDavidWuGptImage2Prompts() {
    const data = await fetchJson<Array<{ id?: number; title_en?: string; title_cn?: string; category?: string; category_cn?: string; prompt?: string; note?: string; author?: string; source?: string; needs_ref?: boolean; image?: string }>>(
        davidWuGptImage2RawBase,
        "prompts.json",
    );
    return data
        .map((item, index) => {
            const title = (item.title_cn || item.title_en || "").trim();
            const prompt = (item.prompt || "").trim();
            if (!title || !prompt) return null;
            const image = absoluteImage(davidWuGptImage2RawBase, item.image || "");
            const preview = [item.title_en, item.note, image ? `![](${image})` : ""].filter(Boolean).join("\n\n");
            return defaultPrompt(`davidwu-gpt-image2-prompts-${leftPad(item.id || index + 1)}`, title, prompt, image, davidWuTags(item), preview);
        })
        .filter((item): item is Omit<Prompt, "category" | "githubUrl"> => Boolean(item));
}

async function buildAwesomeSora2Prompts() {
    const markdown = await fetchText(awesomeSora2RawBase, "README.md");
    const items: Omit<Prompt, "category" | "githubUrl">[] = [];
    for (const block of splitBeforeHeading(markdown, "### ")) {
        const title = firstMatch(block, /^###\s+(.+)$/m).trim();
        const prompt = firstMatch(block, /\*\*Prompt:\*\*\s*\r?\n\s*```[\w-]*\r?\n(.*?)\r?\n```/s).trim();
        if (!title || !prompt) continue;
        const images = contentImages(awesomeSora2RawBase, block);
        items.push(defaultPrompt(`awesome-sora2-${leftPad(items.length + 1)}`, title, prompt, images[0] || "", ["sora2", "video", ...soraTitleTags(title)], markdownPreview(images)));
    }
    return items;
}

async function buildZhangSora2Prompts() {
    const markdowns = await Promise.all(zhangSora2PromptFiles.map((file) => fetchText(zhangSora2RawBase, file).then((markdown) => ({ file, markdown }))));
    const items: Omit<Prompt, "category" | "githubUrl">[] = [];
    for (const { file, markdown } of markdowns) {
        const fileTag = file.replace(/^prompts\//, "").replace(/\.md$/, "");
        for (const block of splitBeforeHeading(markdown, "### ")) {
            const title = firstMatch(block, /^###\s+(.+)$/m).trim();
            const prompt = firstMatch(block, /\*\*(?:Full )?Prompt:\*\*\s*\r?\n\s*```[\w-]*\r?\n(.*?)\r?\n```/s).trim();
            if (!title || !prompt) continue;
            const images = contentImages(zhangSora2RawBase, block);
            items.push(defaultPrompt(`zhangchenchen-sora2-${fileTag}-${leftPad(items.length + 1)}`, title, prompt, images[0] || "", ["sora2", "video", fileTag, ...soraTitleTags(title)], [title, markdownPreview(images)].filter(Boolean).join("\n\n")));
        }
    }
    return items;
}

async function buildLanshuVideoKitPrompts() {
    const data = await fetchJson<{ prompts?: Array<LanshuPrompt> }>(lanshuVideoKitRawBase, "prompts/data/all-prompts.json");
    return (data.prompts || [])
        .map((item, index) => {
            const title = (item.title || "").trim();
            const prompt = (item.prompt || "").trim();
            if (!title || !prompt) return null;
            const tags = splitTags([...(item.tags || []), item.category, item.model, item.source?.tier, "video"].filter(Boolean).join("/"), /\//);
            const preview = [item.notes, item.category ? `场景：${item.category}` : "", item.model ? `模型：${item.model}` : "", item.source?.name ? `来源：${item.source.name}` : ""].filter(Boolean).join("\n\n");
            return defaultPrompt(`lanshu-video-${item.id || leftPad(index + 1)}`, title, prompt, "", tags, preview);
        })
        .filter((item): item is Omit<Prompt, "category" | "githubUrl"> => Boolean(item));
}

async function buildLanshuCrossModelPrompts() {
    const data = await fetchJson<{ scenarios?: Array<LanshuScenario> }>(lanshuVideoKitRawBase, "prompts/data/cross-model-matrix.json");
    const items: Omit<Prompt, "category" | "githubUrl">[] = [];
    for (const scenario of data.scenarios || []) {
        for (const [model, value] of Object.entries(scenario.by_model || {})) {
            const prompt = (value.prompt || "").trim();
            if (!scenario.title || !prompt) continue;
            const tags = splitTags([model, scenario.category, scenario.id, "cross-model", "video"].filter(Boolean).join("/"), /\//);
            const preview = [value.method ? `写法：${value.method}` : "", scenario.use_case ? `用途：${scenario.use_case}` : ""].filter(Boolean).join("\n\n");
            items.push(defaultPrompt(`lanshu-matrix-${safeId(scenario.id)}-${safeId(model)}-${leftPad(items.length + 1)}`, `${scenario.title} · ${model}`, prompt, "", tags, preview));
        }
    }
    return items;
}

function defaultPrompt(id: string, title: string, prompt: string, coverUrl: string, tags: string[], preview: string): Omit<Prompt, "category" | "githubUrl"> {
    return { id, title, coverUrl, prompt, tags, preview, createdAt: "", updatedAt: "" };
}

async function fetchText(baseUrl: string, file: string) {
    const response = await fetch(`${baseUrl}/${file}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`${file} 拉取失败`);
    return response.text();
}

async function fetchJson<T>(baseUrl: string, file: string) {
    return JSON.parse(await fetchText(baseUrl, file)) as T;
}

function splitBeforeHeading(markdown: string, prefix: string) {
    const blocks: string[] = [];
    let current: string[] = [];
    for (const line of markdown.split("\n")) {
        if (line.startsWith(prefix) && current.length) {
            blocks.push(current.join("\n"));
            current = [];
        }
        current.push(line);
    }
    blocks.push(current.join("\n"));
    return blocks;
}

function firstMatch(value: string, pattern: RegExp) {
    return pattern.exec(value)?.[1] || "";
}

function extractMarkdownImages(baseUrl: string, markdown: string) {
    return Array.from(markdown.matchAll(/!\[[^\]]*]\(([^)]+)\)/g), (match) => absoluteImage(baseUrl, match[1])).filter(Boolean);
}

function extractHtmlImages(baseUrl: string, markdown: string) {
    return Array.from(markdown.matchAll(/<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi), (match) => absoluteImage(baseUrl, match[1])).filter(Boolean);
}

function contentImages(baseUrl: string, markdown: string) {
    return uniqueStrings([...extractMarkdownImages(baseUrl, markdown), ...extractHtmlImages(baseUrl, markdown)]).filter((image) => !isBadgeImage(image));
}

function isBadgeImage(image: string) {
    return /(?:img\.shields\.io|awesome\.re\/badge|badge\.svg)/i.test(image);
}

function absoluteImage(baseUrl: string, image: string) {
    if (!image) return "";
    if (/^https?:\/\//i.test(image)) return image;
    return `${baseUrl}/${image.replace(/^\.?\//, "")}`;
}

function tagsFromCategory(category: string) {
    return splitTags(category.replace(/\s+Cases$/i, ""), /\s*(?:&|and)\s*/);
}

function tagsFromHeading(heading: string) {
    return splitTags(heading.replace(/[^\p{L}\p{N}/&、与 ]/gu, ""), /\s*(?:\/|&|、|与)\s*/);
}

function youMindTags(title: string, modelTag: string) {
    const [, prefix] = title.match(/^(.+?) - /) || [];
    return [modelTag, ...tagsFromHeading(prefix || "")];
}

function davidWuTags(item: { category_cn?: string; category?: string; author?: string; source?: string; needs_ref?: boolean }) {
    const tags = splitTags([item.category_cn, item.category, item.author, item.source].filter(Boolean).join("/"), /\//);
    if (item.needs_ref) tags.push("需要参考图");
    return tags;
}

function splitTags(value: string, pattern: RegExp) {
    return value
        .split(pattern)
        .map((tag) => tag.trim().toLowerCase())
        .filter(Boolean);
}

function markdownPreview(images: string[]) {
    return images
        .filter(Boolean)
        .map((image) => `![](${image})`)
        .join("\n\n");
}

function collectTags(items: Prompt[]) {
    return Array.from(new Set(items.flatMap((item) => item.tags).filter(Boolean)));
}

function collectCategories(items: Prompt[]) {
    return Array.from(new Set(items.map((item) => item.category).filter(Boolean)));
}

function leftPad(value: number) {
    return String(value).padStart(4, "0");
}

function soraTitleTags(title: string) {
    return splitTags(title.replace(/^\d+(?:\.\d+)*\.\s*/, ""), /\s*(?:&|\/|-)\s*/).slice(0, 4);
}

function cleanMarkdownText(value: string) {
    return value
        .replace(/!\[[^\]]*]\([^)]+\)/g, "")
        .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
        .replace(/\s+/g, " ")
        .trim();
}

function uniqueStrings(values: string[]) {
    return Array.from(new Set(values.filter(Boolean)));
}

function safeId(value: string) {
    return (
        value
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "") || "item"
    );
}

function isActiveOption(value: string) {
    return value && value !== "全部" && value !== "all";
}

type LanshuPrompt = {
    id?: string;
    model?: string;
    category?: string;
    title?: string;
    prompt?: string;
    tags?: string[];
    source?: {
        name?: string;
        tier?: string;
    };
    notes?: string;
};

type LanshuScenario = {
    id: string;
    title: string;
    category?: string;
    use_case?: string;
    by_model?: Record<string, { method?: string; prompt?: string }>;
};
