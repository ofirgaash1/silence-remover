#!/bin/bash

# Check if directory is provided
if [ -z "$1" ]; then
  echo "Usage: $0 <directory>"
  exit 1
fi

# Recursively find all regular files, excluding hidden files and dirs
find "$1" -type d -name '.*' -prune -o -type f -name '.*' -prune -o -type f -print | while read -r file; do
  echo "##### FILE: $file #####"
  cat "$file"
  echo -e "\n########################\n"
done
