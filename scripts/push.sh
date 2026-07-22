#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "当前目录不是 Git 仓库。"
  exit 1
fi

if [[ -z "$(git status --porcelain)" ]]; then
  echo "没有需要提交的改动。"
  exit 0
fi

echo "当前改动："
git status --short
echo

if [[ "$#" -gt 0 ]]; then
  message="$*"
else
  read -r -p "请输入本次更新内容: " message
fi

message="$(echo "$message" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"

if [[ -z "$message" ]]; then
  echo "提交说明不能为空，已取消。"
  exit 1
fi

git add -A

if git diff --cached --quiet; then
  echo "没有可提交内容。"
  exit 0
fi

git commit -m "$message"
git push

echo
echo "已提交并推送：$message"
