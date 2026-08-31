#!/bin/sh -e

#export G_MESSAGES_DEBUG=all 
export MUTTER_DEBUG_DUMMY_MODE_SPECS=640x480
export G_MESSAGES_DEBUG=all
export SHELL_DEBUG=all

# Check if we need `mutter-devkit` (GNOME 49)
if [ "$(gnome-shell --version | awk '{print int($3)}')" -ge 49 ]; then
    dbus-run-session gnome-shell --devkit --wayland
else
    dbus-run-session gnome-shell --nested --wayland
fi