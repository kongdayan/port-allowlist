# Port Allowlist · 端口 IP 自助白名单

把一个 TCP 端口的访问授权交给客户自助管理。Cloudflare 托管网页与控制 API，ECS 上的小服务使用阿里云 API 同步安全组。**阿里云凭据只放在 ECS，业务流量直接到服务器。**

[English](README.md) · [部署指南](docs/deployment.md) · [安全边界](docs/security.md) · [接口说明](docs/api.md)

## 本地开箱体验

需要 Node.js 22.18+；Agent 测试需要 Python 3.10+。本地体验不需要 Cloudflare 或阿里云密钥。

```sh
git clone https://github.com/kongdayan/port-allowlist.git
cd port-allowlist
npm ci
npm run setup
npm run dev
```

保持服务运行，在第二个终端执行 `npm run bootstrap`。

- 管理员入口：`http://localhost:8798`。在本机查看 `.local/credentials.json` 的 `admin` 字段后登录。
- 客户入口：`http://client.localhost:8798`。登录令牌在 `.local/client.json` 的 `key` 字段。
- 初始客户有 100 条 IP 授权、10 台自动设备；额度由管理员控制。
- 本地没有连接 ECS 同步器，会如实显示等待同步；没有虚构流量，也不会修改本机防火墙。

初始化会自动生成随机密钥并保存为仅当前用户可读文件；再次运行不更换密钥。不要把 `.local`、`.dev.vars` 或云凭据放入 Git。

## 客户能做什么

- 单令牌进入专属域名，只看自己的授权、设备和访问活动。
- 手动添加 / 删除 / 续期 IP；默认 30 个自然日，指定到期日 UTC+8 的 00:00 到期。
- 点击获取当前公网 IPv4；自动设备按心跳登记当前出口并续期。
- 查看实时连接、采样流量、来源节点图和逻辑架构图。
- 管理员明确委托后，可删除该端口原有的来源规则；删除须等待 ECS 确认。

自动设备密钥与网页登录令牌分开。撤销自动设备的某次 IP 授权后，设备下一次心跳可以再次登记；永久停用应撤销设备。

## 生产部署

```sh
npm run setup -- --operator-host access.example.com --client-host team.example.com --brand 'Your Network' --port 10800
npx cf auth login
npm run deploy -- --dry-run
npm run deploy
npm run bootstrap -- --url https://access.example.com --client-host team.example.com --name 'Your Team'
```

准备自己 Cloudflare 账号下的两个域名，然后按[详细部署指南](docs/deployment.md)安装 ECS 同步器。端口、品牌、Worker 名称与入口域名都可配置；ECS 与网页的端口配置必须一致。同步器默认 dry-run；安装程序先预览，不自动启动，不修改 SSH、Docker 或 Nginx。

需要自己的云账号、DNS 与安全组权限；费用和配额按提供商实际计划计算。不同安全组的放行规则可能叠加，必须检查附加到服务器的所有安全组。

## 验证与限制

```sh
npm run build
npm run check
npm test
npm run test:agent
npx playwright install chromium
npm run test:browser
npm run audit:public
```

支持单部署 / 单安全组 / 单 TCP 端口，IPv4 精确地址授权。默认端口为 10800，可以换成其他 TCP 服务。IPv6、UDP、多安全组联动和其他云厂商暂未实现。Windows 脚本包含密钥安全存储和计划任务逻辑，Windows 实机验收仍待完成。

当前地址、流量与会话日志是敏感运行数据，不应提交到 Issue 或公开日志。云安全组通常是有状态的；撤销规则不保证立即中断已建立的连接。应用异常时不会打开全网，但同步器停机时，已经存在的云规则不会自行到期；应监控服务并配置独立告警。

代码和说明采用 MIT 许可证。详细设计、安全边界与回滚方法见 [docs/security.md](docs/security.md) 和 [docs/deployment.md](docs/deployment.md)。
