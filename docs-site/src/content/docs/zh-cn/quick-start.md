---
title: 快速开始
description: 无需云凭据，体验演示或启动真实的本地 API。
---

## 环境要求

Node.js **22.23.4+**、npm 和 Git。CI 使用 Node.js 22.23.4。Agent 测试及 ECS 环境需要 Python 3.10+。依赖已锁定，请使用 `npm ci`。

## 交互演示

```sh
git clone https://github.com/kongdayan/port-allowlist.git
cd port-allowlist
npm ci
npm run demo
```

打开 Vite 输出的地址。无需初始化、云账号、登录令牌或 ECS。页面明确标注模拟数据，支持添加、修改到期日、删除授权、查看访问活动，以及切换客户 / 管理员角色和同步器状态。修改只保留在本标签页，刷新后消失；点击“重置演示”可恢复初始状态。

演示不发送 API 请求，不连接云服务。页面与截图中的地址均为生成的测试数据并已掩码，不是生产清单。展示的密钥不能访问实际服务；脚本下载按钮在演示中替换为使用文档入口。

## 真实的本地网页与 API

```sh
npm run setup
npm run dev
```

保持服务运行，在同一目录的第二个终端执行：

```sh
npm run bootstrap
```

| 入口   | 本地地址                       | 令牌位置                                  |
| ------ | ------------------------------ | ----------------------------------------- |
| 管理员 | `http://localhost:8798`        | `.local/credentials.json` 的 `admin` 字段 |
| 客户   | `http://client.localhost:8798` | `.local/client.json` 的 `key` 字段        |

在本机用编辑器或密码管理器查看令牌文件，再将值粘贴到登录表单。初始化会随机生成密钥，保存为仅当前用户可读文件，不向终端打印。重复初始化不会更换密钥。不要提交 `.local` 或 `.dev.vars`。

Bootstrap 创建一个拥有 100 条授权、10 台自动设备的客户；再次执行会更新已保存客户，不重复创建。本地 API 使用 SQLite Durable Objects 持久存储。此流程不会安装 ECS 同步器或修改防火墙；未连接 Agent 时，显示“尚未连接”和“正在同步”是正常状态。

如果浏览器无法解析 `client.localhost`，请使用 Chromium 或在本机 hosts 中添加该主机名。HTTP 仅用于本地开发，生产必须使用 HTTPS。

## 语言、外观与时间

可随时切换英文、简体中文与浅色 / 深色外观。偏好保存在本机；localStorage 不保存令牌。自动轮询不会重置表单输入、展开的会话组或图表时间范围。

到期日期使用独立配置的业务时区（默认 UTC+8），界面语言和浏览器位置不会改变它。所选日期的 **00:00 起失效**，不包含该日期当天的白天。

## 验证工作副本

```sh
npm run setup
npm run build
npm run check
npm test
npm run test:agent
npm run check:content
npm run build:site
npx playwright install chromium
npm run test:browser
npm run test:site
npm run audit:public
```

在 Git 仓库暂存本次发布文件后执行公开内容扫描。生产配置见[阿里云部署指南](../deployment/)。

以上 UTC+8 示例对应默认策略。管理员可以独立配置其他业务时区，页面会显示实际时区；切换界面语言不会改变已有授权的到期时刻。
