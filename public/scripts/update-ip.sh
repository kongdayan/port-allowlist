#!/bin/bash
# macOS: bash update-ip.sh --setup. Key is stored only in a user-readable config.
set -euo pipefail
ORIGIN='__SERVICE_ORIGIN__'
PROFILE="$(printf '%s' "$ORIGIN" | tr -c '[:alnum:]-' '_')"
DIR="$HOME/.config/port-allowlist/$PROFILE"
LABEL="org.port-allowlist.update-ip.$PROFILE"
umask 077
mkdir -p "$DIR"
chmod 700 "$DIR"
if [[ "${1:-}" == '--setup' ]]; then
  read -r -s -p '粘贴设备密钥（不会显示）: ' DEVICE_KEY
  printf '\n'
  if [[ ! "$DEVICE_KEY" =~ ^pa_device_[A-Za-z0-9_-]{43}$ ]]; then
    printf '设备密钥格式不正确。\n' >&2; exit 1
  fi
  printf 'header = "Authorization: Bearer %s"\n' "$DEVICE_KEY" > "$DIR/curl.conf"
  chmod 600 "$DIR/curl.conf"
  unset DEVICE_KEY
  if [[ "$0" != "$DIR/update-ip.sh" ]]; then cp "$0" "$DIR/update-ip.sh"; fi
  chmod 700 "$DIR/update-ip.sh"
  if [[ "$(uname -s)" == Darwin ]]; then
  mkdir -p "$HOME/Library/LaunchAgents"
  cat > "$HOME/Library/LaunchAgents/$LABEL.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>$LABEL</string>
<key>ProgramArguments</key><array><string>/bin/bash</string><string>$DIR/update-ip.sh</string></array>
<key>RunAtLoad</key><true/><key>StartInterval</key><integer>300</integer>
<key>StandardOutPath</key><string>$DIR/last-run.log</string>
<key>StandardErrorPath</key><string>$DIR/last-error.log</string>
</dict></plist>
PLIST
  launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
  launchctl bootstrap "gui/$(id -u)" "$HOME/Library/LaunchAgents/$LABEL.plist"
  printf '已安装当前用户的五分钟更新任务；网络切换后也可手动运行此脚本。\n'
  else
    printf '密钥已保存。Linux 请自行每五分钟运行此脚本：%s\n' "$DIR/update-ip.sh"
  fi
fi
if [[ ! -r "$DIR/curl.conf" ]]; then printf '请先运行 --setup。\n' >&2; exit 1; fi
/usr/bin/curl -4 --noproxy '*' --silent --show-error --fail \
  --connect-timeout 10 --max-time 25 --config "$DIR/curl.conf" \
  --request POST "$ORIGIN/api/device/refresh"
printf '\n'
