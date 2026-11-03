---
title: 升级与恢复
description: 从 v0.1 升级到 v0.2，保留授权、令牌和访问路径。
---

## v0.2 的变化

客户页面改为带类型的 React 组件，完整支持英文 / 简体中文、手机授权卡片，并在轮询时保留表单和会话展开状态。同步状态更加明确，API 返回稳定错误码与安全参数，下载脚本跟随所选语言。

已有客户授权、域名映射、令牌哈希和 UTC+8 日期到期规则继续有效。Dashboard 新增 `synchronization` 与每项授权的 `removal_pending`；错误保留英文 `error` 回退文案，新增 `code` / `params`。调用方应判断错误码，避免解析人类文案。

本版不增加其他云、Terraform 模块或自动凭据刷新；ECS 规则协调器的防火墙行为不因 UI 版本改变。

## 升级在用实例前

1. 记录 Worker 运行版本、Agent 版本、目标端口，并受限保存当前规则导出。保留经过独立测试的 SSH / 控制台管理通道。
2. 使用 Cloudflare 工具备份 SQLite 数据；私密保存被 Git 忽略的本地配置，以及 ECS 配置、凭据环境、服务单元与 Agent 状态。不要将其上传 GitHub Issue。
3. 按快速开始运行候选版本的完整检查。保留原 Worker 名称和端口，两者参与定位已有数据库。
4. 通过安全的本地流程，将您自己的 `.local/project.json`、`.local/credentials.json`、`.local/worker-secrets.json` 和 `.dev.vars` 放入新工作副本。不要对不相关部署重新初始化，也不要随意重新生成在用令牌。

## 发布应用

在已配置的工作副本中执行：

```sh
npm ci
npm run build
npm run check
npm test
npm run test:agent
npm run deploy -- --dry-run
npm run deploy
```

核对自定义域名、客户登录、已有授权，并通过实际业务服务测试一项临时授权。用新连接测试删除效果后清理测试数据；将无关规则、业务监听、SSH 和 Docker 与升级前基线比较。

UI 升级可继续使用原有 Agent。旧上报若缺少 `last_apply`，撤销授权会保留待确认状态；恢复当前 Agent 的上报即可确认处理。升级 Agent 需明确备份后替换，首次安装工具会拒绝覆盖已有安装。

## 回滚

通过 Cloudflare 恢复上一 Worker 版本；如果更新过 Agent，也恢复配套备份。网页不可用时使用预留管理通道，确认策略和目标端口后再启用写入。

恢复较早数据库快照可能恢复已撤销授权，恢复同步前必须复核。不要用全网放行规则作为恢复捷径。

## 停用服务

同步器仍运行时撤销授权，确认项目自有规则已移除，检查所有保留的历史规则后再停止服务。停止 Agent 或切回预览模式，**不会删除已经下发的规则**。设备密钥与客户令牌需要分别停用。
