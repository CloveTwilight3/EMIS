#!/bin/bash
# File: build/scripts/after-install.sh

# Create desktop shortcut
update-desktop-database || true

# Set up audio permissions if needed
if [ -f /etc/pulse/default.pa ]; then
    # Check if user is in audio group
    if [ $(grep -c "^audio:" /etc/group) -ne 0 ]; then
        current_user=$(logname 2>/dev/null || echo $SUDO_USER)
        if [ -n "$current_user" ]; then
            usermod -a -G audio $current_user 2>/dev/null || true
            echo "Added $current_user to audio group for microphone access"
        fi
    fi
fi

echo "EMIS Assistant installation completed successfully"