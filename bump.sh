#!/bin/sh
# Stamps every ?v= asset URL with a fresh version, so browsers never run a new page against a stale cached
# stylesheet or script (GitHub Pages caches assets for 10 minutes). Run before committing a deploy.
V=$(date +%Y%m%d%H%M%S)
cd "$(dirname "$0")" || exit 1
sed -i '' -E "s#(css/styles\.css)(\?v=[0-9]+)?#\1?v=$V#; s#(js/main\.js)(\?v=[0-9]+)?#\1?v=$V#" index.html
# every module import (./name.js) in every script, so a changed module is never run against a stale cached one
for f in js/*.js; do sed -i '' -E "s#(\./[A-Za-z0-9_-]+\.js)(\?v=[0-9]+)?#\1?v=$V#g" "$f"; done
echo "asset version: $V"
