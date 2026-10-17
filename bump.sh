#!/bin/sh
# Stamps every ?v= asset URL with a fresh version, so browsers never run a new page against a stale cached
# stylesheet or script (GitHub Pages caches assets for 10 minutes). Run before committing a deploy.
V=$(date +%Y%m%d%H%M%S)
cd "$(dirname "$0")" || exit 1
sed -i '' -E "s#(css/styles\.css)(\?v=[0-9]+)?#\1?v=$V#; s#(js/main\.js)(\?v=[0-9]+)?#\1?v=$V#" index.html
sed -i '' -E "s#(\./(world|sky|dof|ride)\.js)(\?v=[0-9]+)?#\1?v=$V#g" js/main.js
sed -i '' -E "s#(\./houses\.js)(\?v=[0-9]+)?#\1?v=$V#g" js/world.js
sed -i '' -E "s#(\./palette\.js)(\?v=[0-9]+)?#\1?v=$V#g" js/houses.js js/world.js js/main.js js/bike.js js/ride.js
sed -i '' -E "s#(\./(world|bike)\.js)(\?v=[0-9]+)?#\1?v=$V#g" js/ride.js
echo "asset version: $V"
