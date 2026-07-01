"use client";

import type { Prompt } from "@/services/api/prompts";
import { cn } from "@/lib/utils";

export function PromptCover({ prompt, className }: { prompt: Prompt; className?: string }) {
    if (prompt.coverUrl) {
        return <img src={prompt.coverUrl} alt={prompt.title} className={cn("bg-stone-100 object-cover dark:bg-stone-900", className)} />;
    }

    const tag = prompt.tags[0] || prompt.category || "prompt";

    return (
        <div className={cn("flex flex-col justify-between bg-stone-100 p-4 text-stone-800 dark:bg-stone-900 dark:text-stone-100", className)}>
            <span className="w-fit rounded bg-stone-200 px-2 py-1 text-[11px] font-medium text-stone-600 dark:bg-stone-800 dark:text-stone-300">{tag}</span>
            <div>
                <div className="line-clamp-2 text-sm font-semibold">{prompt.title}</div>
                <div className="mt-2 line-clamp-3 text-xs leading-5 text-stone-500 dark:text-stone-400">{prompt.prompt}</div>
            </div>
        </div>
    );
}
