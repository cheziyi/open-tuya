#!/usr/bin/env bash
# Clones each GitHub project in the README's Credits table into reference/<owner>/<name>,
# or fast-forwards it if it is already there.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"

# Reads the table rather than a list of its own, so a project added to Credits is cloned too.
# Each line is `<owner>/<name>`, or `<owner>/<name>/tree/<branch>/<folder>` for a link to a folder.
links="$(
  sed -n '/^## Credits/,/^## /p' "$root/README.md" |
    grep -oE '^\| \[[^]]+\]\(https://github\.com/[^)]+\)' |
    sed -E 's/.*https:\/\/github\.com\/([^)]+)\)/\1/'
)"

for link in $links; do
  repository="$(echo "$link" | cut -d/ -f1-2)"
  folder="$(echo "$link" | cut -d/ -f5- -s)"
  target="$root/reference/$repository"
  if [ -d "$target/.git" ]; then
    echo "Updating $repository"
    git -C "$target" pull --ff-only --quiet
  elif [ -n "$folder" ]; then
    echo "Cloning $folder from $repository"
    # Full history, but files only for the linked folder: a whole repository such as home-assistant/core runs to gigabytes.
    git clone --quiet --filter=blob:none --sparse "https://github.com/$repository.git" "$target"
    git -C "$target" sparse-checkout set "$folder"
  else
    echo "Cloning $repository"
    # A full clone, not a shallow one: citing a source needs the commit that introduced a line.
    git clone --quiet "https://github.com/$repository.git" "$target"
  fi
done
