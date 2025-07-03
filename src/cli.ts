#!/usr/bin/env node

/**
 * Wenyan CLI - 文颜命令行工具
 * 支持将 Markdown 文件转换为微信或知乎格式的输出
 */

import { readFile, writeFile } from "fs/promises";
import { dirname, join, extname, basename } from "path";
import { fileURLToPath } from "url";
import { themes, Theme } from "./theme.js";
import { publishToDraft, getDraftList } from "./publish.js";

// @ts-ignore
import { initMarkdownRenderer, renderMarkdown, handleFrontMatter } from "./main.js";

interface FrontMatterResult {
    title?: string;
    description?: string;
    cover?: string;
    body: string;
}

interface CliOptions {
    input?: string;
    output?: string;
    theme: string;
    format: 'wechat' | 'zhihu';
    publish?: boolean;
    draftBatchget?: boolean;
    offset?: number;
    count?: number;
    appId?: string;
    appSecret?: string;
    hostImagePath?: string;
    help?: boolean;
}

function printUsage() {
    console.log(`
Wenyan CLI - 文颜命令行工具

用法:
  wenyan-cli [选项]

选项:
  -i, --input <file>     输入的 Markdown 文件路径 (必需)
  -o, --output <file>    输出文件路径 (可选, 默认为输入文件名 + 格式后缀)
  -t, --theme <theme>    主题名称 (默认: default)
  -f, --format <format>  输出格式: wechat | zhihu (默认: wechat)
  -p, --publish         发布到微信公众号草稿箱 (仅支持 wechat 格式)
  --draft-batchget      获取微信公众号草稿列表
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
  
  # 转换并发布到微信公众号
  wenyan-cli -i article.md -t rainbow -f wechat -p --app-id YOUR_APP_ID --app-secret YOUR_APP_SECRET
  
  # 获取草稿列表
  wenyan-cli --draft-batchget --app-id YOUR_APP_ID --app-secret YOUR_APP_SECRET
  wenyan-cli --draft-batchget --offset 0 --count 10 --app-id YOUR_APP_ID --app-secret YOUR_APP_SECRET
  
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
        offset: 0,
        count: 20
    };

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        
        switch (arg) {
            case '-i':
            case '--input':
                options.input = args[++i];
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
            case '--draft-batchget':
                options.draftBatchget = true;
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

    if (!options.input && !options.help && !options.draftBatchget) {
        throw new Error('缺少必需参数: --input 或 --draft-batchget');
    }

    return options as CliOptions;
}

function generateOutputPath(inputPath: string, format: string): string {
    const dir = dirname(inputPath);
    const name = basename(inputPath, extname(inputPath));
    return join(dir, `${name}.${format}.html`);
}

async function convertMarkdown(inputPath: string, theme: Theme, format: string): Promise<string> {
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
            // 微信格式的特殊处理
            finalHtml = adaptForWechat(html);
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
        
        console.log(`正在转换 "${options.input}"...`);
        console.log(`主题: ${theme.name} (${theme.id})`);
        console.log(`格式: ${options.format}`);
        
        // 读取并处理文件
        const content = await readFile(options.input, 'utf-8');
        const preHandlerContent = handleFrontMatter(content);
        const html = await renderMarkdown(preHandlerContent.body, theme.id);
        
        let finalHtml = html;
        if (options.format === 'zhihu') {
            finalHtml = adaptForZhihu(html);
        } else if (options.format === 'wechat') {
            finalHtml = adaptForWechat(html);
        }
        
        const title = preHandlerContent.title || '未命名文章';
        const cover = preHandlerContent.cover || '';
        
        if (options.publish) {
            // 发布到微信公众号
            console.log('正在发布到微信公众号草稿箱...');
            
            try {
                const mediaId = await publishToWechat(title, finalHtml, cover);
                console.log(`✅ 发布成功！`);
                console.log(`📄 标题: ${title}`);
                console.log(`🆔 Media ID: ${mediaId}`);
                console.log(`📱 请登录微信公众号后台查看草稿箱`);
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                throw new Error(`发布失败: ${errorMessage}`);
            }
        } else {
            // 仅保存为文件
            const outputPath = options.output || generateOutputPath(options.input, options.format);
            console.log(`输出: ${outputPath}`);
            
            const fullHtml = createFullHtmlDocument(finalHtml, title, options.format);
            await writeFile(outputPath, fullHtml, 'utf-8');
            
            console.log(`✅ 转换完成！输出文件: ${outputPath}`);
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
