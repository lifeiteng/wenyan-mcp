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

## 微信公众号 IP 白名单

请务必将服务器 IP 加入公众号平台的 IP 白名单，以确保上传接口调用成功。
详细配置说明请参考：[https://yuzhi.tech/docs/wenyan/upload](https://yuzhi.tech/docs/wenyan/upload)

---

如需更多功能扩展或反馈建议，欢迎提[issue](https://github.com/caol64/wenyan-mcp/issues)。
