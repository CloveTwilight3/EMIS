#!/bin/bash
# File: build/scripts/after-remove.sh

# Clean up desktop integration
update-desktop-database || true

echo "EMIS Assistant has been removed"