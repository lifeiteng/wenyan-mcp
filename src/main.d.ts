// Type definitions for main.js

export interface FrontMatterResult {
    title?: string;
    description?: string;
    cover?: string;
    body: string;
}

export function initMarkdownRenderer(): void;
export function handleFrontMatter(markdown: string): FrontMatterResult;
export function renderMarkdown(content: string, themeId: string): Promise<string>;
