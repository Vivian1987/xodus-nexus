# Nexus Fullscreen Experience

Optional GNOME Shell 51 extension for Xbox mode in Xodus Nexus. It runs within
the current desktop session and restores its changes on exit, lock, owner loss
or extension disablement. It does not create a separate gaming session, stop
desktop applications, defer startup services or promise performance savings.

## Behavior

- Hides selected panel/dock chrome and suppresses overview entry while active.
- Provides a Shell-owned window switcher with native app icons and live window
  previews. Configured app/window shortcuts and directional input select
  eligible open windows.
- Follows the desktop light/dark preference without writing desktop settings.
- Requests fullscreen or available maximize behavior for eligible normal
  windows, restoring their previous state when the mode ends. Dialogs,
  auxiliary windows and the Nexus Game Bar keep their normal roles.
- Gives the existing Nexus Game Bar a bounded focus/foreground context bridge.
  Controller handling is a separate optional Nexus helper.

The emergency exit is **Ctrl+Super+Escape**. If that accelerator is unavailable,
entry fails before desktop chrome is hidden. Desktop return releases the mode;
it does not quit games, log out or restart GNOME.

The extension uses the system font and theme/application icons. No proprietary
fonts, Windows artwork or external asset downloads are required.

## Stage and install

First create a new staging directory outside the live extension directory:

```sh
python3 scripts/desktop/stage-gnome-experience.py --output work/nexus-gnome/staged
```

The helper validates source files and writes their SHA-256 manifest. It does not
install or enable the extension by default. To explicitly copy an inactive
extension into the current user's directory, use a different new stage:

```sh
python3 scripts/desktop/stage-gnome-experience.py \
  --output work/nexus-gnome/install-stage --install
```

Installation refuses an existing destination instead of replacing it. The
packaged helper can use `--source` to select the packaged extension directory.
Enable `nexus-experience@slaveitgr.github.io` through GNOME Extensions after
reviewing the files. GNOME may require a fresh login before a newly installed
extension is discoverable. Nexus never enables the extension automatically.

Disable it through GNOME Extensions to restore normal Shell behavior. Do not
restart the Wayland compositor as a routine installation or recovery step.

## Ownership and limitations

The bus/interface is `org.xodusgaming.Nexus.Experience` and the object is
`/org/xodusgaming/Nexus/Experience`. Nexus keeps a persistent helper connection;
one-shot `gdbus` invocations are not an application-lifetime lease. Entry requires
the focused Nexus window and the actual helper-parent process relationship in
the same unlocked user session. Accepted application identities are the Nexus
desktop IDs or native `xodus-nexus`/`xodus-nexus.bin` window class. There is no
privileged installation-path shortcut for a background process.

Foreground metadata and previews remain local and transient. The extension
does not expose arbitrary commands, file access, process arguments or Shell
evaluation. A close-window request follows the normal window-manager close
path, including an application's save confirmation.

An optional explicit restart can prepare a one-shot launcher autostart for the
next boot. That is ordinary login startup, not a reduced desktop or a memory
optimization. Portable AppImages need a persistent executable path; a temporary
AppImage mount is rejected. Unsupported desktops retain ordinary application
fullscreen behavior when the caller permits that fallback.

Only GNOME Shell 51 is advertised. Isolated tests exercise ownership, restore,
input, theme and protocol behavior without enabling the extension or changing a
real Shell session. Actual multi-monitor, game, lock and physical-controller
acceptance must be performed in a disposable graphical test session before
claiming those outcomes on a distribution.

## Development checks

```sh
node --test scripts/desktop/gnome-experience.test.mjs
npx vitest run src/main/experience-client.test.ts \
  src/main/fullscreen-experience.test.ts src/main/xbox-mode-startup.test.ts \
  src/main/xbox-mode-restart.test.ts src/main/xbox-mode-entry-handoff.test.ts \
  src/shared/desktop-shell.test.ts
```

The native transport/theme checks use private D-Bus sessions and in-memory
settings. They skip where their GJS/GNOME libraries are unavailable.
