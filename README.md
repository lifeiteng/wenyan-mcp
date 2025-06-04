# 文颜 MCP Server

https://github.com/user-attachments/assets/2c355f76-f313-48a7-9c31-f0f69e5ec207

## Overview

文颜 MCP Server 是一个基于模型上下文协议（Model Context Protocol, MCP）的服务器组件，支持将 Markdown 格式的文章发布至微信公众号草稿箱，并使用与 [文颜](https://yuzhi.tech/wenyan) 相同的主题系统进行排版。

## Features

- 列出并选择支持的文章主题
- 使用内置主题对 Markdown 内容排版
- 发布文章到微信公众号草稿箱
- 自动上传本地或网络图片

## Installation

### Prerequisites

确保已安装 [Node.js](https://nodejs.org/) 环境。

### Clone 仓库

```bash
git clone https://github.com/caol64/wenyan-mcp.git
cd wenyan-mcp
```

### 构建项目

```bash
npm install
npm run build
```

## Integration

在你的 MCP 配置文件中加入以下内容来启用文颜 MCP Server：

```json
{
  "mcpServers": {
    "wenyan-mcp": {
      "name": "公众号助手",
      "type": "stdio",
      "command": "node",
      "args": [
        "Your/path/to/wenyan-mcp/dist/index.js"
      ],
      "env": {
        "WECHAT_APP_ID": "your_app_id",
        "WECHAT_APP_SECRET": "your_app_secret"
      }
    }
  }
}
```

请注意`WECHAT_APP_ID`和`WECHAT_APP_SECRET`两个环境变量。

## 微信公众号 IP 白名单

请务必将服务器 IP 加入公众号平台的 IP 白名单，以确保上传接口调用成功。
详细配置说明请参考：[https://yuzhi.tech/docs/wenyan/upload](https://yuzhi.tech/docs/wenyan/upload)

## 配置说明

为了可以正确上传文章，需要在每一篇 Markdown 文章的开头添加一段`frontmatter`，提供`title`、`cover`两个字段：

```
---
title: 在本地跑一个大语言模型(2) - 给模型提供外部知识库
cover: /Users/lei/Downloads/result_image.jpg
---
```

- `title`是文章标题，必填。
- `cover`是文章封面，分为两种情况：
  - 如果正文里有至少一张图片，可以省略，此时会将正文中的一张图片作为封面
  - 如果正文里没有图片，则`cover`不能省略

## 关于图片自动上传

无论是cover还是正文中的图片，都支持本地格式（/Users/lei/Downloads/result_image.jpg）和网络格式（https://example.com/result_image.jpg）。

## 文章示例

```markdown
---
title: 在本地跑一个大语言模型(2) - 给模型提供外部知识库
description: Make your local large language models (LLMs) smarter! This guide shows how to use LangChain and RAG to let them retrieve data from external knowledge bases, improving answer accuracy.
cover: /Users/lei/Downloads/result_image.jpg
---
在[上一篇文章](https://babyno.top/posts/2024/02/running-a-large-language-model-locally/)里，我们展示了如何通过Ollama这款工具，在本地运行大型语言模型。本篇文章将着重介绍下如何让模型从外部知识库中检索定制数据，来提升大型语言模型的准确性，让它看起来更“智能”。

本篇文章将涉及到`LangChain`和`RAG`两个概念，在本文中不做详细解释。

## 准备模型

访问`Ollama`的模型页面，搜索`qwen`，我们这次将使用对中文语义了解的更好的“[通义千问](https://ollama.com/library/qwen:7b)”模型进行实验。

![](https://mmbiz.qpic.cn/mmbiz_jpg/Jsq9IicjScDVUjkPc6O22ZMvmaZUzof5bLDjMyLg2HeAXd0icTvlqtL7oiarSlOicTtiaiacIxpVOV1EeMKl96PhRPPw/640?wx_fmt=jpeg)
```

---

如需更多功能扩展或反馈建议，欢迎提[issue](https://github.com/caol64/wenyan-mcp/issues)。
