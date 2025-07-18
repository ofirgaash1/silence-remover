#!/bin/bash

# Check if directory is provided
if [ -z "$1" ]; then
  echo "Usage: $0 <directory>"
  exit 1
fi

echo "Starting scan in directory: $1"
echo "----------------------------------"

# Safely handle paths like "." and still prune hidden files/dirs
find "$1" \( -path '*/.*' -prune \) -o -type f -print0 | while IFS= read -r -d '' file; do
  echo "##### FILE: $file #####"

  if file "$file" | grep -q 'text'; then
    # Use 'cat' to preserve formatting
    cat -- "$file"
  else
    echo "[Non-text file skipped]"
  fi

  # Use printf to ensure spacing is consistent
  printf "\n########################\n\n"
done

