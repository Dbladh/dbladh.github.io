#!/bin/sh
# Run before committing changes to the mini-golf generator or physics: a quick check of 12 months plus the bot on 3.
cd "$(dirname "$0")/../.." || exit 1
node tools/golf/check.mjs --months 12 || exit 1
node tools/golf/check.mjs --months 3 --bot || exit 1
