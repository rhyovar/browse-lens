#!/bin/bash
# postinst — create /usr/bin/browse-lens symlink after dpkg -i
set -e
TARGET="/usr/bin/browse-lens"
SOURCE="/opt/BrowseLens/usr/bin/browse-lens"
if [ ! -e "$TARGET" ]; then
    ln -s "$SOURCE" "$TARGET"
fi
