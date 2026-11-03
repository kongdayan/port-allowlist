// Stable wire codes; safe, localized descriptions shared by the API and UI.
export const errorMessages = {
  REQUEST_TOO_LARGE: {
    en: 'The request is too large.',
    'zh-CN': '请求过大',
  },
  INVALID_JSON: {
    en: 'Enter a valid JSON object.',
    'zh-CN': '无效 JSON',
  },
  INVALID_NAME: {
    en: 'Use a name between 1 and 80 characters.',
    'zh-CN': '名称长度须为 1–80 字',
  },
  RATE_LIMITED: {
    en: 'Too many requests. Wait a minute and try again.',
    'zh-CN': '请求过于频繁，请稍后再试',
  },
  INVALID_CREDENTIAL: {
    en: 'This token is invalid, revoked, or its account is disabled.',
    'zh-CN': '密钥无效、已撤销或客户已停用',
  },
  LOGIN_REQUIRED: {
    en: 'Sign in to continue.',
    'zh-CN': '请先登录',
  },
  SESSION_EXPIRED: {
    en: 'Your session has expired. Sign in again.',
    'zh-CN': '登录已过期',
  },
  ORIGIN_REJECTED: {
    en: 'This request must come from the same site.',
    'zh-CN': '来源校验失败',
  },
  ACCESS_REVOKED: {
    en: 'Your access has been revoked.',
    'zh-CN': '访问已撤销',
  },
  ADMIN_REQUIRED: {
    en: 'This action requires an operator account.',
    'zh-CN': '仅管理员可操作',
  },
  DEVICE_SCOPE_ONLY: {
    en: 'A device token can only update its own network address.',
    'zh-CN': '设备密钥仅可更新本设备 IP',
  },
  CUSTOMER_REQUIRED: {
    en: 'Select a customer first.',
    'zh-CN': '请选择客户',
  },
  CUSTOMER_NOT_FOUND: {
    en: 'This customer was not found.',
    'zh-CN': '客户不存在',
  },
  PORTAL_UNAVAILABLE: {
    en: 'This access portal is unavailable. Contact your operator.',
    'zh-CN': '此访问入口暂不可用',
  },
  PORTAL_TOKEN_MISMATCH: {
    en: 'This token belongs to a different portal.',
    'zh-CN': '此令牌不适用于当前访问入口',
  },
  CUSTOMER_PORTAL_REQUIRED: {
    en: 'Use your dedicated customer portal.',
    'zh-CN': '请使用专属客户入口',
  },
  INVALID_AGENT_CREDENTIAL: {
    en: 'The synchronizer credential is invalid.',
    'zh-CN': '无效服务身份',
  },
  DEPLOYMENT_CAPACITY_REACHED: {
    en: 'The deployment address limit has been reached. Contact your operator.',
    'zh-CN': '当前 IP 数量超过部署保护上限',
  },
  INVALID_INVENTORY: {
    en: 'The reported firewall inventory is invalid.',
    'zh-CN': '无效规则清单',
  },
  INVENTORY_TOO_LARGE: {
    en: 'The firewall inventory is too large.',
    'zh-CN': '规则清单过大',
  },
  NOT_FOUND: {
    en: 'This endpoint was not found.',
    'zh-CN': '接口不存在',
  },
  DEVICE_TOKEN_REQUIRED: {
    en: 'Use the token issued for this device.',
    'zh-CN': '请使用设备专属密钥',
  },
  AUTHORIZATION_LIMIT_REACHED: {
    en: 'The authorization limit has been reached. Remove another grant first.',
    'zh-CN': 'IP 授权数量已达上限，请先删除其他授权',
  },
  INVALID_TOKEN_LENGTH: {
    en: 'Use a token between 8 and 128 characters without control characters.',
    'zh-CN': '访问令牌长度须为 8–128 个字符',
  },
  TOKEN_REUSE_FORBIDDEN: {
    en: 'A customer token cannot reuse an operator or agent credential.',
    'zh-CN': '访问令牌不能复用运营或服务凭据',
  },
  TOKEN_ALREADY_ASSIGNED: {
    en: 'This token is already assigned to another identity.',
    'zh-CN': '该令牌不可用于当前账户',
  },
  HOST_ALREADY_BOUND: {
    en: 'This hostname belongs to another customer.',
    'zh-CN': '该入口已经绑定到其他账户',
  },
  PORT_ALREADY_DELEGATED: {
    en: 'Existing port rules are already delegated to another customer.',
    'zh-CN': '端口现有规则已分配到其他账户',
  },
  QUOTA_BELOW_USAGE: {
    en: 'Remove existing devices or grants before lowering the quota.',
    'zh-CN': '请先减少已有设备/IP，再降低额度',
  },
  INVALID_CUSTOMER_TIER: {
    en: 'Choose a valid customer tier.',
    'zh-CN': '客户等级无效',
  },
  DEVICE_LIMIT_REACHED: {
    en: 'The device limit has been reached or the account is disabled.',
    'zh-CN': '设备数量已达上限或客户已停用',
  },
  DEVICE_NOT_FOUND: {
    en: 'This device was not found.',
    'zh-CN': '设备不存在',
  },
  AUTHORIZATION_CONFLICT: {
    en: 'This address is already authorized, the quota is full, or the account is disabled.',
    'zh-CN': '地址已授权、额度已满或客户已停用',
  },
  RULE_NOT_FOUND: {
    en: 'This firewall rule was not found in your portal.',
    'zh-CN': '授权不存在或不属于当前入口',
  },
  RULE_STILL_REQUIRED: {
    en: 'An active grant still needs this source. Remove that grant before deleting this rule.',
    'zh-CN': '该来源仍有有效 IP 授权，请先删除对应授权，再删除这条现有规则',
  },
  AUTHORIZATION_NOT_FOUND: {
    en: 'This authorization was not found.',
    'zh-CN': '授权不存在',
  },
  AUTOMATIC_EXPIRY_MANAGED: {
    en: 'Automatic device expiry is renewed by its heartbeat.',
    'zh-CN': '自动设备的有效期由心跳续期管理',
  },
  RENEWAL_CONFLICT: {
    en: 'The quota or deployment capacity is full, or this account is disabled.',
    'zh-CN': '授权额度或部署 IP 容量已满，或客户已停用',
  },
  IP_REQUIRED: {
    en: 'Enter one public IPv4 address.',
    'zh-CN': '需要单个公网 IPv4 地址',
  },
  PUBLIC_IP_REQUIRED: {
    en: 'Use one public IPv4 address. Private, reserved and network ranges are not accepted.',
    'zh-CN': '只允许单个公网 IPv4；不允许内网、保留地址或网段',
  },
  NUMBER_OUT_OF_RANGE: {
    en: 'Enter a whole number between {min} and {max}.',
    'zh-CN': '数值范围为 {min}–{max}',
  },
  DATE_FORMAT_INVALID: {
    en: 'Use the expiry date format YYYY-MM-DD.',
    'zh-CN': '到期日期格式应为 YYYY-MM-DD',
  },
  DATE_INVALID: {
    en: 'Choose a valid calendar date.',
    'zh-CN': '到期日期无效',
  },
  DAYS_REQUIRED: {
    en: 'Authorizations now use calendar days. Refresh and select an expiry date.',
    'zh-CN': '授权已改为按天，请刷新页面后重新选择到期日期',
  },
  DATE_OUT_OF_RANGE: {
    en: 'Choose a future expiry date within {max} calendar days.',
    'zh-CN': '到期日期须晚于现在，且不超过 {max} 个自然日',
  },
  INVALID_PORTAL_HOST: {
    en: 'Use a valid customer hostname distinct from the operator hostname.',
    'zh-CN': '专属域名无效或与运营入口冲突',
  },
  SERVICE_UNAVAILABLE: {
    en: 'The service is temporarily unavailable. Try again shortly.',
    'zh-CN': '服务暂时不可用，请稍后重试',
  },
  NETWORK_UNAVAILABLE: {
    en: 'Unable to connect. Check your network and try again.',
    'zh-CN': '网络连接失败，请检查网络后重试',
  },
  SYNC_FAILED: {
    en: 'Synchronization failed. Contact your operator. Access will not be widened automatically.',
    'zh-CN': '同步失败，请联系服务管理员；不会自动扩大访问范围',
  },
} as const;
export type ErrorCode = keyof typeof errorMessages;
export class PublicError extends Error {
  constructor(
    public status: number,
    public code: ErrorCode,
    public params: Record<string, string | number> = {},
  ) {
    super(errorMessages[code].en);
  }
}
