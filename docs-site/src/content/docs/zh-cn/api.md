---
title: API 参考
description: 身份角色、授权接口、稳定错误码与同步元数据。
---

## 调用约定

脚本使用 JSON 请求体及 `Authorization: Bearer <token>`，不要把密钥放在查询参数中。浏览器登录使用安全会话 Cookie。所有客户调用必须使用该客户绑定的域名。

| 方法与路径                             | 身份                               | 用途                                                               |
| -------------------------------------- | ---------------------------------- | ------------------------------------------------------------------ |
| `GET /api/portal`                      | 公开                               | 当前域名的品牌、模式和端口                                         |
| `POST /api/login`                      | 请求体 `key` 中的管理员 / 客户令牌 | 建立浏览器会话，检查域名绑定                                       |
| `POST /api/logout`                     | 浏览器会话                         | 撤销当前会话                                                       |
| `GET /api/ip`                          | 客户 / 管理员                      | 获取 Cloudflare 观测来源及可用公网 IPv4                            |
| `GET /api/dashboard`                   | 客户 / 管理员                      | 按身份隔离的授权、设备、规则和采样                                 |
| `POST /api/leases`                     | 客户 / 管理员                      | 添加 `{ip,label,days:30}` 或 `{ip,label,expire_date:"YYYY-MM-DD"}` |
| `PATCH /api/leases/:id`                | 所属客户 / 管理员                  | 用天数或到期日续期手动授权                                         |
| `DELETE /api/leases/:id`               | 所属客户 / 管理员                  | 撤销授权，保留审计记录                                             |
| `POST /api/devices`                    | 客户 / 管理员                      | 通过 `{name}` 创建设备，签发一次性设备密钥                         |
| `DELETE /api/devices/:id`              | 所属客户 / 管理员                  | 停用设备、密钥及其授权                                             |
| `POST /api/device/refresh`             | 仅设备                             | 授权其观测到的公网 IPv4，并续期                                    |
| `DELETE /api/firewall-rules/:ref`      | 获委托客户 / 管理员                | 请求删除已委托的精确端口历史规则                                   |
| `POST /api/admin/customers`            | 仅管理员                           | 创建 `{name}`，返回 ID 与一次性客户令牌                            |
| `PATCH /api/admin/customers/:id`       | 仅管理员                           | 配额、启停、名称与租约策略                                         |
| `POST /api/admin/customers/:id/key`    | 仅管理员                           | 更换客户令牌；不传 `token` 则随机生成                              |
| `POST /api/admin/customers/:id/portal` | 仅管理员                           | 绑定 `{hostname,manage_existing_rules:false}`                      |
| `GET /api/agent/desired`               | 仅 Agent                           | 固定端口、原到期时间的期望授权与明确删除引用                       |
| `POST /api/agent/report`               | 仅 Agent                           | 上报规则清单、状态和受大小约束的采样                               |

管理员为客户操作时传 `customer_id`；Dashboard 用 `?customer=<id>` 选择客户。客户页面不接收内部客户 ID 或运营配置。创建授权成功表示策略已提交，不等于已经放行；应结合 `applied` 和实际新 TCP 连接验收。删除历史规则返回 HTTP 202，等待 Agent 清单确认消失。冲突为 HTTP 409。

默认手动授权按 30 个自然日计算，最长 365 天，于所选日期 **00:00 UTC+8** 到期，不包含所选日期当天白天。业务时区独立通过 `--time-zone` 配置，默认 `Asia/Shanghai`（UTC+8）。自动设备默认租约 60 分钟，换网宽限 120 秒，由管理员配置。

## 稳定错误结构

错误响应包含 `code`、`params` 和英文 `error` 回退文案。UI 在本地翻译 `code`，不渲染原始云诊断信息。例如：

```json
{
  "code": "AUTHORIZATION_LIMIT_REACHED",
  "params": {},
  "error": "The authorization limit has been reached. Remove another grant first."
}
```

`NUMBER_OUT_OF_RANGE` 带数字 `min` / `max`，`DATE_OUT_OF_RANGE` 带数字 `max`，其他错误当前参数为空。HTTP 含义不变：400 参数校验、401 认证、403 权限或来源、404 不存在或无权访问、409 冲突、413 过大、429 限流、500 内部错误。未知异常返回 `SERVICE_UNAVAILABLE`。

错误码与中英文案以 `shared/errors.ts` 为准，CI 会检查其占位符与界面语言键一致性。设备更新错误也使用稳定错误码，不应解析翻译文案。诊断日志必须移除密钥、请求体和真实来源地址。

## 同步元数据

Dashboard 新增 `synchronization.state`，值为 `unavailable`、`ready`、`dry_run`、`stale`、`error`，同时提供 `updated_at` 和 `last_reconciled_at`。客户数据不包含原始云错误。

已撤销授权若 `removal_pending=true`，表示还没有撤销时刻之后的成功 apply 协调确认。历史规则删除则需规则清单确认不存在。原有 `applied` 字段继续表示近期清单覆盖此有效授权。

脚本下载接受 `?lang=en` 或 `?lang=zh-CN`；缺省及未知语言使用英文。只替换经过检查的固定文案，下载域名由当前入口决定，不嵌入设备令牌。
