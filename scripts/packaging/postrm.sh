#!/bin/bash
# postrm — remove /usr/bin/browse-lens symlink after dpkg -r
set -e
rm -f /usr/bin/browse-lens
