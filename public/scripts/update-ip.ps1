param([switch]$Setup, [switch]$Run)
$ErrorActionPreference = 'Stop'
$Origin = '__SERVICE_ORIGIN__'
$ProfileName = $Origin -replace '[^a-zA-Z0-9-]', '_'
$Dir = Join-Path (Join-Path $env:LOCALAPPDATA 'PortAllowlist') $ProfileName
$TokenFile = Join-Path $Dir 'device-key.xml'
New-Item -ItemType Directory -Force -Path $Dir | Out-Null
if ($Setup) {
  $Secret = Read-Host '粘贴设备密钥（不会显示）' -AsSecureString
  $Secret | Export-Clixml -Path $TokenFile
  $Destination = Join-Path $Dir 'update-ip.ps1'
  if ($PSCommandPath -ne $Destination) { Copy-Item -Force $PSCommandPath $Destination }
  $Action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "' + $Destination + '" -Run')
  $Trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 5)
  $Principal = New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
  Register-ScheduledTask -TaskName ('PortAllowlist-UpdateIP-' + $ProfileName) -Action $Action -Trigger $Trigger -Principal $Principal -Force | Out-Null
  Write-Host '已安装当前用户的五分钟更新任务。网络切换后也可手动运行。'
}
if (-not (Test-Path $TokenFile)) { throw '请先运行 -Setup。' }
$Secret = Import-Clixml -Path $TokenFile
$Pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secret)
try {
  $Token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($Pointer)
  if ($Token -notmatch '^pa_device_[A-Za-z0-9_-]{43}$') { throw '设备密钥格式不正确。' }
  # Pipe the header configuration to curl; the secret is absent from process arguments.
  $Config = 'header = "Authorization: Bearer ' + $Token + '"'
  $Config | & curl.exe -4 --noproxy '*' --silent --show-error --fail --connect-timeout 10 --max-time 25 --config - --request POST "$Origin/api/device/refresh"
  if ($LASTEXITCODE -ne 0) { throw '更新失败，请检查网络、设备状态和密钥。' }
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($Pointer)
  $Token = $null
  $Config = $null
}
