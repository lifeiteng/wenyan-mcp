#!/usr/bin/env node

/**
 * Wenyan CLI - 文颜命令行工具
 * 支持将 Markdown 文件转换为微信或知乎格式的输出
 */

import { readFile, writeFile, access } from "fs/promises";
import { dirname, join, extname, basename } from "path";
import { fileURLToPath } from "url";
import { constants } from "fs";
import { themes, Theme } from "./theme.js";
import { publishToDraft, getDraftList, deleteDraft, deleteAllDrafts, publishMultipleArticlesToDraft, publishAllDrafts, publishDraft, Article } from "./publish.js";

// @ts-ignore
import { initMarkdownRenderer, renderMarkdown, handleFrontMatter } from "./main.js";

interface FrontMatterResult {
    title?: string;
    description?: string;
    cover?: string;
    body: string;
}

interface CliOptions {
    input?: string | string[];
    output?: string;
    theme: string;
    format: 'wechat' | 'zhihu';
    publish?: boolean;
    draftBatchget?: boolean;
    draftDelete?: boolean;
    draftDeleteAll?: boolean;
    draftPublish?: boolean;
    draftPublishAll?: boolean;
    mediaId?: string;
    offset?: number;
    count?: number;
    appId?: string;
    appSecret?: string;
    hostImagePath?: string;
    cardLayout?: boolean;
    help?: boolean;
}

function printUsage() {
    console.log(`
Wenyan CLI - 文颜命令行工具

用法:
  wenyan-cli [选项]

选项:
  -i, --input <file>     输入的 Markdown 文件路径 (必需)，支持多个文件用逗号分隔
  -o, --output <file>    输出文件路径 (可选, 默认为输入文件名 + 格式后缀)
  -t, --theme <theme>    主题名称 (默认: default)
  -f, --format <format>  输出格式: wechat | zhihu (默认: wechat)
  -p, --publish         发布到微信公众号草稿箱 (仅支持 wechat 格式)
  --card-layout         生成卡片式排版，支持左右滑动阅读 (仅支持 wechat 格式)
  --draft-batchget      获取微信公众号草稿列表
  --draft-delete        删除指定的微信公众号草稿
  --draft-delete-all    删除所有微信公众号草稿
  --draft-publish       发布指定的微信公众号草稿 (可与 -p 同时使用实现发布后立即上线)
  --draft-publish-all   发布所有微信公众号草稿
  --media-id <id>       草稿的 Media ID (删除指定草稿时必需)
  --offset <number>     草稿列表偏移量 (默认: 0)
  --count <number>      草稿列表获取数量 (默认: 20)
  --app-id <id>         微信公众号 App ID (发布时必需，或通过 WECHAT_APP_ID 环境变量设置)
  --app-secret <secret> 微信公众号 App Secret (发布时必需，或通过 WECHAT_APP_SECRET 环境变量设置)
  --host-image-path <path> 本地图片路径 (可选，或通过 HOST_IMAGE_PATH 环境变量设置)
  -h, --help            显示帮助信息

可用主题:
${Object.entries(themes).map(([id, theme]) => 
    `  ${id.padEnd(12)} - ${theme.name}: ${theme.description}`
).join('\n')}

示例:
  # 仅转换格式
  wenyan-cli -i article.md -t rainbow -f wechat
  wenyan-cli -i article.md -o output.html -t lapis -f zhihu
  
  # 生成卡片式排版
  wenyan-cli -i article.md -t rainbow -f wechat --card-layout
  
  # 转换多个文件为卡片式排版
  wenyan-cli -i article1.md,article2.md,article3.md -t rainbow -f wechat --card-layout
  
  # 转换并发布到微信公众号
  wenyan-cli -i article.md -t rainbow -f wechat -p --app-id YOUR_APP_ID --app-secret YOUR_APP_SECRET
  
  # 转换、发布到草稿箱并立即发布上线
  wenyan-cli -i article.md -t rainbow -f wechat -p --draft-publish --app-id YOUR_APP_ID --app-secret YOUR_APP_SECRET
  
  # 发布多个文章到微信公众号
  wenyan-cli -i article1.md,article2.md -t rainbow -f wechat -p --app-id YOUR_APP_ID --app-secret YOUR_APP_SECRET
  
  # 获取草稿列表
  wenyan-cli --draft-batchget --app-id YOUR_APP_ID --app-secret YOUR_APP_SECRET
  wenyan-cli --draft-batchget --offset 0 --count 10 --app-id YOUR_APP_ID --app-secret YOUR_APP_SECRET
  
  # 删除指定草稿
  wenyan-cli --draft-delete --media-id MEDIA_ID_HERE --app-id YOUR_APP_ID --app-secret YOUR_APP_SECRET
  
  # 发布指定草稿
  wenyan-cli --draft-publish --media-id MEDIA_ID_HERE --app-id YOUR_APP_ID --app-secret YOUR_APP_SECRET
  
  # 删除所有草稿
  wenyan-cli --draft-delete-all --app-id YOUR_APP_ID --app-secret YOUR_APP_SECRET
  
  # 发布所有草稿
  wenyan-cli --draft-publish-all --app-id YOUR_APP_ID --app-secret YOUR_APP_SECRET
  
  # 使用环境变量
  export WECHAT_APP_ID=your_app_id
  export WECHAT_APP_SECRET=your_app_secret
  wenyan-cli -i article.md -t rainbow -f wechat -p

环境变量:
  WECHAT_APP_ID         微信公众号 App ID
  WECHAT_APP_SECRET     微信公众号 App Secret
  HOST_IMAGE_PATH       本地图片目录路径
    `);
}

function parseArgs(args: string[]): CliOptions {
    const options: Partial<CliOptions> = {
        theme: 'default',
        format: 'wechat',
        publish: false,
        draftBatchget: false,
        draftDelete: false,
        draftDeleteAll: false,
        draftPublish: false,
        draftPublishAll: false,
        cardLayout: false,
        offset: 0,
        count: 20
    };

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        
        switch (arg) {
            case '-i':
            case '--input':
                const inputValue = args[++i];
                // 支持逗号分隔的多个文件
                if (inputValue.includes(',')) {
                    options.input = inputValue.split(',').map(file => file.trim());
                } else {
                    options.input = inputValue;
                }
                break;
            case '-o':
            case '--output':
                options.output = args[++i];
                break;
            case '-t':
            case '--theme':
                options.theme = args[++i];
                break;
            case '-f':
            case '--format':
                const format = args[++i];
                if (format !== 'wechat' && format !== 'zhihu') {
                    throw new Error(`无效的输出格式: ${format}. 支持的格式: wechat, zhihu`);
                }
                options.format = format;
                break;
            case '-p':
            case '--publish':
                options.publish = true;
                break;
            case '--card-layout':
                options.cardLayout = true;
                break;
            case '--draft-batchget':
                options.draftBatchget = true;
                break;
            case '--draft-delete':
                options.draftDelete = true;
                break;
            case '--draft-delete-all':
                options.draftDeleteAll = true;
                break;
            case '--draft-publish':
                options.draftPublish = true;
                break;
            case '--draft-publish-all':
                options.draftPublishAll = true;
                break;
            case '--media-id':
                options.mediaId = args[++i];
                break;
            case '--offset':
                const offset = parseInt(args[++i], 10);
                if (isNaN(offset) || offset < 0) {
                    throw new Error(`无效的偏移量: ${args[i]}. 必须是非负整数`);
                }
                options.offset = offset;
                break;
            case '--count':
                const count = parseInt(args[++i], 10);
                if (isNaN(count) || count <= 0 || count > 100) {
                    throw new Error(`无效的数量: ${args[i]}. 必须是1-100之间的正整数`);
                }
                options.count = count;
                break;
            case '--app-id':
                options.appId = args[++i];
                break;
            case '--app-secret':
                options.appSecret = args[++i];
                break;
            case '--host-image-path':
                options.hostImagePath = args[++i];
                break;
            case '-h':
            case '--help':
                options.help = true;
                break;
            default:
                if (arg.startsWith('-')) {
                    throw new Error(`未知选项: ${arg}`);
                }
                break;
        }
    }

    // 验证互斥选项
    if (options.draftDelete && options.draftDeleteAll) {
        throw new Error('--draft-delete 和 --draft-delete-all 不能同时使用');
    }
    if (options.draftDeleteAll && options.draftPublishAll) {
        throw new Error('--draft-delete-all 和 --draft-publish-all 不能同时使用');
    }
    if (options.draftDelete && options.draftPublishAll) {
        throw new Error('--draft-delete 和 --draft-publish-all 不能同时使用');
    }
    if (options.draftDelete && options.draftPublish) {
        throw new Error('--draft-delete 和 --draft-publish 不能同时使用');
    }
    if (options.draftPublish && options.draftPublishAll) {
        throw new Error('--draft-publish 和 --draft-publish-all 不能同时使用');
    }

    // 验证卡片式排版选项
    if (options.cardLayout && options.format !== 'wechat') {
        throw new Error('卡片式排版仅支持微信公众号格式 (--format wechat)');
    }

    if (!options.input && !options.help && !options.draftBatchget && !options.draftDelete && !options.draftDeleteAll && !options.draftPublish && !options.draftPublishAll) {
        throw new Error('缺少必需参数: --input 或 --draft-batchget 或 --draft-delete 或 --draft-delete-all 或 --draft-publish 或 --draft-publish-all');
    }

    return options as CliOptions;
}

function generateOutputPath(inputPath: string, format: string): string {
    const dir = dirname(inputPath);
    const name = basename(inputPath, extname(inputPath));
    return join(dir, `${name}.${format}.html`);
}

async function validateInputFiles(inputPaths: string[]): Promise<void> {
    const invalidFiles: string[] = [];
    
    for (const inputPath of inputPaths) {
        try {
            await access(inputPath, constants.F_OK);
        } catch (error) {
            invalidFiles.push(inputPath);
        }
    }
    
    if (invalidFiles.length > 0) {
        throw new Error(`以下输入文件不存在或无法访问：\n${invalidFiles.map(f => `  - ${f}`).join('\n')}`);
    }
}

async function processMarkdownFile(inputPath: string, theme: Theme, format: string, cardLayout: boolean = false): Promise<{
    title: string;
    content: string;
    cover: string;
    html: string;
}> {
    try {
        // 读取输入文件
        const content = await readFile(inputPath, 'utf-8');
        
        // 处理 frontmatter
        const preHandlerContent = handleFrontMatter(content);
        
        // 渲染 Markdown 为 HTML
        const html = await renderMarkdown(preHandlerContent.body, theme.id);
        
        // 根据输出格式调整样式
        let finalHtml = html;
        
        if (format === 'zhihu') {
            // 知乎格式的特殊处理
            finalHtml = adaptForZhihu(html);
        } else if (format === 'wechat') {
            if (cardLayout) {
                // 微信卡片式排版
                finalHtml = adaptForWechatCardLayout(html);
            } else {
                // 微信普通格式的特殊处理
                finalHtml = adaptForWechat(html);
            }
        }
        
        const title = preHandlerContent.title || basename(inputPath, extname(inputPath));
        const cover = preHandlerContent.cover || '';
        
        return {
            title,
            content: finalHtml,
            cover,
            html: finalHtml
        };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new Error(`处理文件 ${inputPath} 失败: ${errorMessage}`);
    }
}

async function convertMarkdown(inputPath: string, theme: Theme, format: string, cardLayout: boolean = false): Promise<string> {
    try {
        // 读取输入文件
        const content = await readFile(inputPath, 'utf-8');
        
        // 处理 frontmatter
        const preHandlerContent = handleFrontMatter(content);
        
        // 渲染 Markdown 为 HTML
        const html = await renderMarkdown(preHandlerContent.body, theme.id);
        
        // 根据输出格式调整样式
        let finalHtml = html;
        
        if (format === 'zhihu') {
            // 知乎格式的特殊处理
            finalHtml = adaptForZhihu(html);
        } else if (format === 'wechat') {
            if (cardLayout) {
                // 微信卡片式排版
                finalHtml = adaptForWechatCardLayout(html);
            } else {
                // 微信普通格式的特殊处理
                finalHtml = adaptForWechat(html);
            }
        }
        
        // 创建完整的HTML文档
        const title = preHandlerContent.title || '未命名文章';
        const fullHtml = createFullHtmlDocument(finalHtml, title, format);
        
        return fullHtml;
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new Error(`转换失败: ${errorMessage}`);
    }
}

function adaptForZhihu(html: string): string {
    // 知乎平台的样式适配
    // 知乎支持部分HTML标签，但有限制
    return html
        .replace(/style="[^"]*"/g, '') // 移除内联样式，知乎会过滤
        .replace(/<section/g, '<div') // 将section标签替换为div
        .replace(/<\/section>/g, '</div>');
}

function adaptForWechat(html: string): string {
    // 微信公众号的样式适配
    // 微信公众号支持内联样式
    return html;
}

function adaptForWechatCardLayout(html: string): string {
    // 微信公众号卡片式排版适配
    // 将内容分割成卡片，并添加左右滑动样式
    
    // 查找所有的 h1, h2, h3 标题作为卡片分割点
    const cardSections = html.split(/(<h[1-3][^>]*>.*?<\/h[1-3]>)/gi);
    
    if (cardSections.length <= 1) {
        // 如果没有标题分割，将整个内容作为一张卡片
        return createCardLayoutWrapper([html]);
    }
    
    const cards: string[] = [];
    let currentCard = '';
    
    for (let i = 0; i < cardSections.length; i++) {
        const section = cardSections[i].trim();
        if (!section) continue;
        
        // 检查是否是标题
        if (/^<h[1-3]/i.test(section)) {
            // 如果已有内容，保存当前卡片
            if (currentCard.trim()) {
                cards.push(currentCard.trim());
            }
            // 开始新卡片，以标题开头
            currentCard = section;
        } else {
            // 添加到当前卡片
            currentCard += section;
        }
    }
    
    // 添加最后一张卡片
    if (currentCard.trim()) {
        cards.push(currentCard.trim());
    }
    
    return createCardLayoutWrapper(cards);
}

function createCardLayoutWrapper(cards: string[]): string {
    const cardItems = cards.map((card, index) => `
        <div class="wenyan-card" style="
            min-width: 280px;
            max-width: 320px;
            padding: 20px;
            margin: 0 10px;
            background: #ffffff;
            border-radius: 12px;
            box-shadow: 0 2px 12px rgba(0,0,0,0.1);
            border: 1px solid #f0f0f0;
            flex-shrink: 0;
            position: relative;
            overflow: hidden;
        ">
            <div class="wenyan-card-content" style="
                font-size: 14px;
                line-height: 1.6;
                color: #333;
            ">
                ${card}
            </div>
            <div class="wenyan-card-number" style="
                position: absolute;
                top: 12px;
                right: 12px;
                background: rgba(0,0,0,0.1);
                color: #666;
                padding: 2px 8px;
                border-radius: 10px;
                font-size: 12px;
            ">
                ${index + 1}/${cards.length}
            </div>
        </div>
    `).join('');

    return `
    <div class="wenyan-card-container" style="
        width: 100%;
        overflow-x: auto;
        padding: 20px 0;
        background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
        -webkit-overflow-scrolling: touch;
        scrollbar-width: none;
        -ms-overflow-style: none;
    ">
        <style>
            .wenyan-card-container::-webkit-scrollbar {
                display: none;
            }
            .wenyan-card-wrapper {
                display: flex;
                align-items: flex-start;
                padding: 0 20px;
                gap: 0;
            }
            .wenyan-card {
                transition: transform 0.2s ease;
            }
            .wenyan-card:hover {
                transform: translateY(-2px);
            }
            .wenyan-card h1, .wenyan-card h2, .wenyan-card h3 {
                margin-top: 0;
                margin-bottom: 16px;
                color: #2c3e50;
            }
            .wenyan-card h1 { font-size: 18px; }
            .wenyan-card h2 { font-size: 16px; }
            .wenyan-card h3 { font-size: 14px; }
            .wenyan-card p {
                margin-bottom: 12px;
            }
            .wenyan-card img {
                max-width: 100%;
                border-radius: 8px;
                margin: 8px 0;
            }
            .wenyan-card pre {
                background: #f8f9fa;
                padding: 12px;
                border-radius: 6px;
                font-size: 12px;
                overflow-x: auto;
            }
            .wenyan-card blockquote {
                border-left: 3px solid #3498db;
                padding-left: 12px;
                margin: 12px 0;
                font-style: italic;
                color: #666;
            }
        </style>
        <div class="wenyan-card-wrapper">
            ${cardItems}
        </div>
        <div style="
            text-align: center;
            margin-top: 16px;
            color: #888;
            font-size: 12px;
        ">
            👈 左右滑动查看更多内容 👉
        </div>
    </div>`;
}

function createFullHtmlDocument(content: string, title: string, format: string): string {
    const formatInfo = format === 'wechat' ? '微信公众号' : '知乎';
    
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <meta name="description" content="由文颜工具生成，适用于${formatInfo}">
    <meta name="generator" content="Wenyan CLI">
</head>
<body>
    ${content}
</body>
</html>`;
}

function setupWechatEnvironment(options: CliOptions) {
    // 设置微信相关环境变量
    if (options.appId) {
        process.env.WECHAT_APP_ID = options.appId;
    }
    if (options.appSecret) {
        process.env.WECHAT_APP_SECRET = options.appSecret;
    }
    if (options.hostImagePath) {
        process.env.HOST_IMAGE_PATH = options.hostImagePath;
    }
}

function validateWechatCredentials(): void {
    const appId = process.env.WECHAT_APP_ID;
    const appSecret = process.env.WECHAT_APP_SECRET;
    
    if (!appId || !appSecret) {
        throw new Error(
            '发布到微信公众号需要提供 App ID 和 App Secret。\n' +
            '可以通过以下方式提供：\n' +
            '1. 命令行参数：--app-id YOUR_APP_ID --app-secret YOUR_APP_SECRET\n' +
            '2. 环境变量：WECHAT_APP_ID 和 WECHAT_APP_SECRET'
        );
    }
}

async function publishToWechat(
    title: string, 
    htmlContent: string, 
    cover: string
): Promise<string> {
    try {
        const response = await publishToDraft(title, htmlContent, cover);
        return response.media_id;
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new Error(`发布到微信公众号失败: ${errorMessage}`);
    }
}

async function main() {
    try {
        const args = process.argv.slice(2);
        const options = parseArgs(args);
        
        if (options.help) {
            printUsage();
            process.exit(0);
        }
        
        // 验证发布选项
        if (options.publish) {
            if (options.format !== 'wechat') {
                throw new Error('目前仅支持发布到微信公众号 (格式必须为 wechat)');
            }
            
            // 设置微信环境变量
            setupWechatEnvironment(options);
            
            // 验证微信凭据
            validateWechatCredentials();
        }

        // 验证获取草稿列表选项
        if (options.draftBatchget) {
            // 设置微信环境变量
            setupWechatEnvironment(options);
            
            // 验证微信凭据
            validateWechatCredentials();
            
            // 获取草稿列表
            console.log('正在获取微信公众号草稿列表...');
            console.log(`偏移量: ${options.offset}, 数量: ${options.count}`);
            
            try {
                const result = await getDraftList(options.offset, options.count);
                console.log(`✅ 获取成功！共 ${result.total_count} 篇草稿`);
                console.log(`📄 本次获取 ${result.item_count} 篇草稿：\n`);
                
                if (result.item && result.item.length > 0) {
                    result.item.forEach((item: any, index: number) => {
                        const article = item.content.news_item[0];
                        console.log(`${index + 1}. 📝 ${article.title}`);
                        console.log(`   🆔 Media ID: ${item.media_id}`);
                        console.log(`   📅 更新时间: ${new Date(item.update_time * 1000).toLocaleString('zh-CN')}`);
                        if (article.digest) {
                            console.log(`   📖 摘要: ${article.digest}`);
                        }
                        console.log('');
                    });
                } else {
                    console.log('暂无草稿');
                }
                
                return;
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                throw new Error(`获取草稿列表失败: ${errorMessage}`);
            }
        }

        // 验证删除草稿选项
        if (options.draftDelete) {
            // 验证 Media ID
            if (!options.mediaId) {
                throw new Error('删除指定草稿需要提供 Media ID，请使用 --media-id 参数');
            }
            
            // 设置微信环境变量
            setupWechatEnvironment(options);
            
            // 验证微信凭据
            validateWechatCredentials();
            
            // 删除草稿
            console.log('正在删除微信公众号草稿...');
            console.log(`Media ID: ${options.mediaId}`);
            
            try {
                await deleteDraft(options.mediaId);
                console.log(`✅ 删除成功！`);
                console.log(`🗑️  已删除 Media ID: ${options.mediaId}`);
                console.log(`📱 请登录微信公众号后台确认删除结果`);
                
                return;
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                throw new Error(`删除草稿失败: ${errorMessage}`);
            }
        }

        // 验证删除所有草稿选项
        if (options.draftDeleteAll) {
            // 设置微信环境变量
            setupWechatEnvironment(options);
            
            // 验证微信凭据
            validateWechatCredentials();
            
            // 删除所有草稿
            console.log('正在删除所有微信公众号草稿...');
            console.log('⚠️  警告：此操作将删除所有草稿，无法恢复！');
            
            try {
                const result = await deleteAllDrafts();
                
                if (result.total_count === 0) {
                    console.log('📭 没有找到任何草稿');
                    return;
                }
                
                console.log(`✅ 删除完成！`);
                console.log(`📊 删除统计：`);
                console.log(`   总计草稿数: ${result.total_count}`);
                console.log(`   成功删除: ${result.deleted_count}`);
                console.log(`   删除失败: ${result.failed_count || 0}`);
                
                if (result.failed_count && result.failed_count > 0 && result.failed_items) {
                    console.log(`❌ 删除失败的草稿：`);
                    result.failed_items.forEach((item: any, index: number) => {
                        console.log(`   ${index + 1}. Media ID: ${item.media_id}`);
                        console.log(`      错误: ${item.error}`);
                    });
                }
                
                console.log(`📱 请登录微信公众号后台确认删除结果`);
                
                return;
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                throw new Error(`删除所有草稿失败: ${errorMessage}`);
            }
        }

        // 验证发布指定草稿选项
        if (options.draftPublish && !options.publish) {
            // 验证 Media ID
            if (!options.mediaId) {
                throw new Error('发布指定草稿需要提供 Media ID，请使用 --media-id 参数');
            }
            
            // 设置微信环境变量
            setupWechatEnvironment(options);
            
            // 验证微信凭据
            validateWechatCredentials();
            
            // 发布草稿
            console.log('正在发布微信公众号草稿...');
            console.log(`Media ID: ${options.mediaId}`);
            
            try {
                const result = await publishDraft(options.mediaId);
                console.log(`✅ 发布成功！`);
                console.log(`🆔 Media ID: ${options.mediaId}`);
                console.log(`📝 Publish ID: ${result.publish_id}`);
                console.log(`📱 请登录微信公众号后台查看发布结果`);
                
                return;
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                throw new Error(`发布草稿失败: ${errorMessage}`);
            }
        }

        // 验证发布所有草稿选项
        if (options.draftPublishAll) {
            // 设置微信环境变量
            setupWechatEnvironment(options);
            
            // 验证微信凭据
            validateWechatCredentials();
            
            // 发布所有草稿
            console.log('正在发布所有微信公众号草稿...');
            console.log('⚠️  警告：此操作将发布所有草稿，无法撤销！');
            
            try {
                const result = await publishAllDrafts();
                
                if (result.total_count === 0) {
                    console.log('📭 没有找到任何草稿');
                    return;
                }
                
                console.log(`✅ 发布完成！`);
                console.log(`📊 发布统计：`);
                console.log(`   总计草稿数: ${result.total_count}`);
                console.log(`   成功发布: ${result.published_count}`);
                console.log(`   发布失败: ${result.failed_count || 0}`);
                
                if (result.successful_items && result.successful_items.length > 0) {
                    console.log(`✅ 成功发布的草稿：`);
                    result.successful_items.forEach((item: any, index: number) => {
                        console.log(`   ${index + 1}. Media ID: ${item.media_id}`);
                        console.log(`      Publish ID: ${item.publish_id}`);
                    });
                }
                
                if (result.failed_count && result.failed_count > 0 && result.failed_items) {
                    console.log(`❌ 发布失败的草稿：`);
                    result.failed_items.forEach((item: any, index: number) => {
                        console.log(`   ${index + 1}. Media ID: ${item.media_id}`);
                        console.log(`      错误: ${item.error}`);
                    });
                }
                
                console.log(`📱 请登录微信公众号后台查看发布结果`);
                
                return;
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                throw new Error(`发布所有草稿失败: ${errorMessage}`);
            }
        }

        // 如果不是获取草稿列表，则需要输入文件
        if (!options.input) {
            throw new Error('缺少必需参数: --input');
        }
        
        // 验证主题
        const theme = themes[options.theme];
        if (!theme) {
            const availableThemes = Object.keys(themes).join(', ');
            throw new Error(`无效的主题: ${options.theme}. 可用主题: ${availableThemes}`);
        }
        
        // 初始化 Markdown 渲染器
        initMarkdownRenderer();
        
        // 处理输入文件（支持单个文件或多个文件）
        const inputPaths = Array.isArray(options.input) ? options.input : [options.input];
        
        // 验证输入文件是否存在
        await validateInputFiles(inputPaths);
        
        console.log(`正在转换 ${inputPaths.length} 个文件...`);
        console.log(`主题: ${theme.name} (${theme.id})`);
        console.log(`格式: ${options.format}`);
        if (options.cardLayout) {
            console.log(`排版: 卡片式 (支持左右滑动)`);
        }
        
        // 处理所有输入文件
        const processedFiles = await Promise.all(
            inputPaths.map(inputPath => processMarkdownFile(inputPath, theme, options.format, options.cardLayout))
        );
        
        if (options.publish) {
            // 发布到微信公众号
            console.log('正在发布到微信公众号草稿箱...');
            
            try {
                if (processedFiles.length === 1) {
                    // 单个文件，使用原有的发布方法
                    const file = processedFiles[0];
                    const mediaId = await publishToWechat(file.title, file.content, file.cover);
                    console.log(`✅ 发布成功！`);
                    console.log(`📄 标题: ${file.title}`);
                    console.log(`🆔 Media ID: ${mediaId}`);
                    
                    // 如果同时指定了 --draft-publish，则立即发布草稿
                    if (options.draftPublish) {
                        console.log('正在立即发布草稿...');
                        try {
                            const publishResult = await publishDraft(mediaId);
                            console.log(`✅ 立即发布成功！`);
                            console.log(`📝 Publish ID: ${publishResult.publish_id}`);
                            console.log(`📱 文章已发布，请登录微信公众号后台查看`);
                        } catch (error) {
                            const errorMessage = error instanceof Error ? error.message : String(error);
                            console.error(`❌ 立即发布失败: ${errorMessage}`);
                            console.log(`📱 草稿已保存在草稿箱，可以手动发布或使用 --draft-publish --media-id ${mediaId} 命令发布`);
                        }
                    } else {
                        console.log(`📱 请登录微信公众号后台查看草稿箱`);
                    }
                } else {
                    // 多个文件，使用新的批量发布方法
                    const articles: Article[] = processedFiles.map(file => ({
                        title: file.title,
                        content: file.content,
                        cover: file.cover
                    }));
                    
                    const result = await publishMultipleArticlesToDraft(articles);
                    console.log(`✅ 批量发布成功！`);
                    console.log(`📄 发布了 ${processedFiles.length} 篇文章`);
                    processedFiles.forEach((file, index) => {
                        console.log(`   ${index + 1}. ${file.title}`);
                    });
                    console.log(`🆔 Media ID: ${result.media_id}`);
                    
                    // 如果同时指定了 --draft-publish，则立即发布草稿
                    if (options.draftPublish) {
                        console.log('正在立即发布草稿...');
                        try {
                            const publishResult = await publishDraft(result.media_id);
                            console.log(`✅ 立即发布成功！`);
                            console.log(`📝 Publish ID: ${publishResult.publish_id}`);
                            console.log(`📱 文章已发布，请登录微信公众号后台查看`);
                        } catch (error) {
                            const errorMessage = error instanceof Error ? error.message : String(error);
                            console.error(`❌ 立即发布失败: ${errorMessage}`);
                            console.log(`📱 草稿已保存在草稿箱，可以手动发布或使用 --draft-publish --media-id ${result.media_id} 命令发布`);
                        }
                    } else {
                        console.log(`📱 请登录微信公众号后台查看草稿箱`);
                    }
                }
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                throw new Error(`发布失败: ${errorMessage}`);
            }
        } else {
            // 仅保存为文件
            if (processedFiles.length === 1) {
                // 单个文件
                const file = processedFiles[0];
                const outputPath = options.output || generateOutputPath(inputPaths[0], options.format);
                console.log(`输出: ${outputPath}`);
                
                const fullHtml = createFullHtmlDocument(file.content, file.title, options.format);
                await writeFile(outputPath, fullHtml, 'utf-8');
                
                console.log(`✅ 转换完成！输出文件: ${outputPath}`);
            } else {
                // 多个文件
                console.log(`正在保存 ${processedFiles.length} 个文件...`);
                
                const savePromises = processedFiles.map(async (file, index) => {
                    const inputPath = inputPaths[index];
                    const outputPath = generateOutputPath(inputPath, options.format);
                    const fullHtml = createFullHtmlDocument(file.content, file.title, options.format);
                    await writeFile(outputPath, fullHtml, 'utf-8');
                    return outputPath;
                });
                
                const outputPaths = await Promise.all(savePromises);
                
                console.log(`✅ 转换完成！输出文件:`);
                outputPaths.forEach((outputPath, index) => {
                    console.log(`   ${index + 1}. ${outputPath}`);
                });
            }
        }
        
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`❌ 错误: ${errorMessage}`);
        process.exit(1);
    }
}

// 只有当直接运行此文件时才执行main函数
if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}

export { main, convertMarkdown };
