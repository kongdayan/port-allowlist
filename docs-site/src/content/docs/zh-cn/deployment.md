---
title: 阿里云部署
description: 部署 Cloudflare 网页与受限 ECS 同步器。
---

## 1. 配置 Worker

先执行 `npm ci`、`npm run setup`，并满足快速开始中的 Node.js 版本要求。Cloudflare CLI 与 Vite 已锁定版本，CLI 当前仍为 beta。

| setup 参数        | 含义                                      | 默认           |
| ----------------- | ----------------------------------------- | -------------- |
| `--operator-host` | 管理员与 Agent 入口，同时配置为自定义域名 | 本地运营入口   |
| `--client-host`   | 附加到 Worker 的客户域名                  | 无             |
| `--port`          | 此部署唯一可管理的 TCP 端口               | 10800          |
| `--brand`         | 页面服务品牌                              | Port Access    |
| `--worker`        | Cloudflare Worker 名称                    | port-allowlist |

生成的 `.local/project.json` 被 Git 忽略，因为域名可能识别客户。`domains` 为自定义域名列表，`operator_hosts` 是特权 API 主机白名单；其他域名必须已绑定启用的客户。新增客户时，既要将域名附加到 Worker，也要通过 bootstrap 绑定；不要把管理员域名绑定给客户。

请使用自己 Cloudflare 管理域中的自定义域名，`workers.dev` 默认禁用。多个独立部署应使用不同工作副本、Worker 名称、密钥及 Agent 状态目录。改变端口会定位到另一协调对象，不会自动迁移或清理原端口。

```sh
npm run setup -- --operator-host access.example.com --client-host team.example.com --port 10800 --brand 'Your Network'
npx cf auth login
npm run deploy -- --dry-run
npm run deploy
npm run bootstrap -- --url https://access.example.com --client-host team.example.com --name 'Your Team' --quota 100
```

部署仅将管理员 / Agent 两项令牌哈希作为 secret 上传 Cloudflare，原始值留在 `.local/credentials.json`。Bootstrap 将首次签发的客户令牌先存到 `.local/client.json`，再继续后续配置，失败可重试；再运行会更新已保存客户。额外客户通过管理员 UI / API 创建。

本地运营入口为 `localhost`，客户入口为 `client.localhost`。Chromium 将 localhost 视为可信本地开发环境；生产必须使用 HTTPS。

## 2. 准备 ECS 安全组

1. 选择一个安全组和一个 TCP 端口，优先使用仅附加到预期网卡的服务专属安全组。
2. 审查实例附加的全部安全组：其他组宽泛放行可能绕过白名单，跨端口规则也不会被 Agent 收紧或删除。
3. 受限保存现有规则导出，保留经过独立登录验证的 SSH / 控制台管理通道。
4. 确认业务进程已监听目标端口；本项目不安装或改造 TCP 业务服务。
5. 为专用 RAM 身份只授权 `ecs:DescribeSecurityGroupAttribute`、`ecs:AuthorizeSecurityGroup`、`ecs:RevokeSecurityGroup`，在提供商支持的范围内限制到目标安全组，在自己的账号实测读 / 增 / 删权限。不要授予 ECS 或 RAM 全权限。

当前官方文档对 `AuthorizeSecurityGroup` 的资源范围说明有差异：API 权限表列出所有资源，RAM 管理指南提供安全组范围示例。不要在组范围授权失败时直接扩大为所有资源，应先在目标账号明确支持边界并记录。Agent 的固定目标与端口是应用保护，不能替代 RAM 授权。

官方参考：[安全组范围 RAM 示例](https://help.aliyun.com/en/ram/manage-ecs-security-groups-within-an-alibaba-cloud-account)、[AuthorizeSecurityGroup](https://www.alibabacloud.com/help/en/ecs/developer-reference/api-ecs-2014-05-26-authorizesecuritygroup)、[RevokeSecurityGroup](https://help.aliyun.com/en/ecs/developer-reference/api-ecs-2014-05-26-revokesecuritygroup)。

## 3. 在 ECS 安装 Agent

需要 Linux / systemd、Python 3.10+、`iproute2` / `ss`，以及到管理员域名和地域 ECS API 的出站 HTTPS。ECS 不新增入站管理 API。系统包名因发行版而异。

使用已有安全 SSH 连接复制 `agent/` 到 ECS。**阿里云凭据文件在 ECS 上创建，不放在网页工程内。** 根据 `agent/config.example.json` 配置 `control_url`、`region`、`security_group_id`，以及与 Worker 相同的 `port`，保持 JSON 布尔值 `apply: false`。

```sh
umask 077
cp agent/config.example.json config.json
cp agent/credentials.env.example agent.env
chmod 600 agent.env
# 在 ECS 的编辑器中填写 config.json 和 agent.env。
python3 agent/install.py --config config.json --credentials agent.env
sudo python3 agent/install.py --config config.json --credentials agent.env --install
sudo python3 /opt/port-allowlist/agent.py --config /etc/port-allowlist/config.json --env-file /etc/port-allowlist/credentials.env --check-cloud
sudo systemctl enable --now port-allowlist
sudo journalctl -u port-allowlist -n 30 --no-pager
```

`agent.env` 保存 `PROXY_ACCESS_AGENT_KEY`（本机生成的 Agent 令牌）、`ALIYUN_ACCESS_KEY_ID`、`ALIYUN_ACCESS_KEY_SECRET`。可选 `ALIYUN_SECURITY_TOKEN` 接受外部提供的 STS 凭据，但**没有实现 RAM Role / STS 自动刷新**，使用临时凭据时必须有自己的轮换流程。不要使用主账号 AccessKey。

安装器默认只预览，要求凭据文件仅所有者可读，且首次必须 `apply=false`；已有安装会拒绝覆盖。`--install` 只复制文件、创建专用系统用户并 reload systemd，不会启动服务。systemd 读取 root 私有凭据，Agent 在专用非 root 用户下运行，受 CPU / 内存限制。地域和安全组 ID 不传到 Cloudflare。

## 4. 确认后启用同步

1. 在预览模式确认网页能看到 Agent 和现有规则清单。执行一次私有计划导出，目标文件必须不存在：

```sh
sudo python3 /opt/port-allowlist/agent.py --config /etc/port-allowlist/config.json --env-file /etc/port-allowlist/credentials.env --once --plan-file /root/port-allowlist-plan.json
```

计划 JSON 包含敏感来源地址，只在本机查看，不公开。Agent 日志仅记录数量和错误，不打印密钥或来源清单。

2. 从另一台机器创建可丢弃的授权，核对策略端口是否正确。
3. 在 ECS 把 `/etc/port-allowlist/config.json` 的 `apply` 改为 JSON 布尔值 `true`，重启 `port-allowlist`。
4. 验证云规则及一个**新的业务 TCP 连接**，再撤销测试授权，用新连接确认被阻止；已有连接可能继续存在。
5. 将无关端口规则、SSH、业务监听与 Docker 状态对比基线，清理临时测试。

不要在替代精确规则建立前删除历史宽泛规则。协调器先添加并确认新规则，再删除旧项目自有规则；不操作其他端口、UDP、出站、全协议或端口范围规则。删除历史来源必须是精确目标端口，并有最新清单指纹。

## 5. 可选：委托历史规则删除

默认保留非本项目规则。如果确定这些精确端口 TCP 入站来源属于一个客户，可执行：

```sh
npm run bootstrap -- --url https://access.example.com --client-host team.example.com --name 'Your Team' --manage-existing
```

委托对该端口是独占的。客户随后可逐条发起删除；Agent 复核规则 ID 与指纹，先补齐仍需保留的精确授权，再删除指定规则并上报清单。其他历史规则保留。共享同一来源的人可能同时失去访问，请先核实归属。

## 6. 可选会话日志与流量采样

实时连接 / 字节差分来自 Linux `ss`，不需要修改业务。容器网络命名空间、内核计数器和读取权限可能影响可见性，需在目标主机核验。缺失采样显示不可用，不作为真实零流量。

已结束会话卡片可读取换行分隔 JSON 日志。已有 Nginx `stream` 服务可在适当上下文参考：

```nginx
log_format port_allowlist escape=json
  '{"ts":"$time_iso8601","ip":"$remote_addr","bytes_up":$bytes_received,"bytes_down":$bytes_sent,"duration":$session_time,"status":"$status"}';
access_log /var/log/port-allowlist/sessions.log port_allowlist;
```

配置日志轮转，并只向 `port-allowlist` 用户提供必要读取权限。先 `nginx -t` 再 reload；安装器不会修改 Nginx。没有此日志，实时采样仍可运行，已结束会话为空。不要记录完整 URL、目的地址或载荷。

## 7. 客户自动更新

详见[设备自动更新](../devices/)。设备密钥独立于客户令牌，脚本按当前页面语言下载；Linux 需自行安装定时任务，Windows 实机验收仍待完成。

## 8. 升级、恢复与文档发布

先私密备份，再升级，保留独立管理通道。停止 Agent 不删除云规则，切回预览模式也不会撤销既有访问。停用前应在 Agent 正常运行时撤销授权，确认清理后再停服务，详见[升级与恢复](../upgrade/)。

`npm run build:site` 将中英 Starlight 文档和隔离演示组装到 `site-dist/`，由仓库 Pages workflow 验证后发布。不包含 Worker 服务端包或密钥。Fork 可设置 `GITHUB_REPOSITORY`，或用 `DOCS_SITE_URL` / `DOCS_BASE_PATH` 配置自己的域名及路径，并调整门户与 README 的文档链接。

生产门户仍是单独的 Cloudflare 部署，发布文档不会改 ECS 防火墙。v0.2 只支持阿里云。

## 独立配置业务时区

`npm run setup -- --time-zone Asia/Shanghai` 使用默认 UTC+8；也可指定 `--time-zone UTC` 或 `America/New_York` 等受支持的 IANA 时区。它独立于界面语言和浏览器所在地，修改后需重新部署对应 Worker。

新的手动授权与续期在所选业务日期开始时失效。夏令时按自然日计算，不按固定 24 小时相加；若零点被跳过，使用该日期的首个有效时刻；整个日期被跳过时拒绝该日期。改变时区不会重写已有授权的绝对到期时间。UI 按业务时区显示观测时间并明确标注时区。
