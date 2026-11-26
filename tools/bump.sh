#!/bin/sh
# Give app.js and style.css a new version number in index.html, so browsers load the new code after a change.
v=$(date +%s)
sed -i -E "s/(style\.css|app\.js)(\?v=[0-9]+)?\"/\1?v=$v\"/g" "$(dirname "$0")/../index.html"
