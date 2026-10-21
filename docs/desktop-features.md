# Optional desktop features

These additions keep the existing Xodus Nexus interface, account setup, backend
selection and runtime. Open **More** for Game Pass, Cloud gaming, Friends and chat,
your profile, or Play later and history. Desktop integrations are optional; a
normal launch does not install a service or change GNOME.

## Account and library

Profile details and subscription labels come from the selected account's backend.
Missing fields remain unavailable; a stored sign-in does not prove online
presence or a subscription. Refresh the profile to update cached information.
The patched backend adds profile details and social commands; older backends
remain usable and show unsupported social features honestly.

Friends, presence, conversations, search and message sending depend on Xbox
service permissions. Sending requires an explicit action. **Xbox party voice
is not implemented.** Audio settings provide a local microphone test with live
monitoring only after you start it. Stop the test to release the microphone.

Play later and launch history are stored locally per verified account. History
records games observed running in Nexus, not installation dates or unverified
Xbox activity. Game Pass lists supported PC products returned by the account
provider. Other launcher detection checks desktop entries; it does not connect
accounts, import their libraries or run Windows extensions.

A game's handheld information is public Microsoft **Windows PC** metadata. It is
not a Linux compatibility verdict or a promise that a game will run in Proton.

## Game Bar

Use **Settings → Desktop features → Open Game Bar**, or **Ctrl+G** while Nexus is
focused. The separate Game Bar window supports controller navigation: D-pad or
left stick, A/B, LB/RB, and left/right on selected sliders. The native listener
reads eligible joysticks only; it does not capture keyboards or change device
permissions. Unsupported devices require ordinary controls.

Available widgets include foreground application context, Home/Library,
account social panels, audio/microphone controls, per-application audio where
supported, desktop system settings, process performance, a Nexus screenshot
gallery and Spotify desktop playback through MPRIS. Spotify must expose its
session MPRIS player. No Spotify credentials are required. Browser music players
and Xbox party voice are not supported. Screenshot capture covers the Nexus
window; external-game screenshots and video recording are not implemented.

To keep Game Bar available independently of an open Nexus window, explicitly
install the optional user service from a persistent installed launcher path:

```sh
python3 scripts/desktop/install-gamebar-service.py \
  --launcher '/absolute/path/to/Xodus-Nexus.AppImage' --enable --start
```

Use the same helper with `--uninstall` to remove its owned unit. Installation
without `--enable` or `--start` does neither. It never installs packages or grants
input permissions. A temporary AppImage mount is not a persistent launcher path.
The service is named `nexus-gamebar.service`. Do not enable both Nexus and another
launcher’s global Guide listener at the same time.

## Fullscreen Experience

The optional [GNOME Shell 51 extension](../desktop/gnome/nexus-experience@slaveitgr.github.io/README.md)
provides reversible Xbox mode, a window switcher, light/dark appearance,
application icons/previews and foreground context for Game Bar. It controls only
eligible windows in the current desktop session. **Ctrl+Super+Escape** is its
emergency desktop return. Installation and enabling are separate explicit steps.

**Settings → Desktop features → Enter Xbox mode** opens a choice to start now,
stay on the desktop, or restart when that capability is available. Restart is
requested only after choosing it; it prepares a one-time normal login launch.
This is not a separate gaming session, startup-process suspension or a verified
performance optimization. Clock and battery indicators appear only after actual
fullscreen is observed. The existing desktop header is otherwise retained.

Window behavior, physical-controller mappings, multiple displays and suspend
must be tested on the target GNOME session. KDE, other GNOME versions and other
compositors do not receive this extension integration. Ordinary app fullscreen
remains available where supported.

## Streaming

**More → Cloud gaming** and **Settings → Xbox streaming → Console Remote Play**
open the official Xbox website in separate isolated player views. Each has its
own session storage, browser navigation controls and Microsoft sign-in. No Nexus
account token is injected. Opening a page does not start a game or buy access.
Remote Play requires a configured supported Xbox console; cloud availability
requires an eligible account, region and supported browser environment.

These are website players, not a reimplementation of Microsoft's native Windows
streaming client. Real streaming, codec/input support and account acceptance in
Electron on Linux require a device test; an offline UI test does not establish
that they work. Other launcher dialogs and Game Bar obscure the embedded players.

## Launch and download options

Per-game GameMode is opt-in and requires `gamemoderun`; Nexus reports when an
automatic optional wrapper is unavailable. Existing launch-wrapper behavior
remains available. Proton launch directories are checked for ownership and
unsafe links, and an owned prefix is made non-writable by other users before
runtime initialization.

Download notifications, automatic desktop shortcuts, login startup, background
startup and keeping Nexus in the tray are off by default. Tray visibility depends
on the desktop. Bits/bytes changes download-rate presentation only; the configured
MiB/s limit is unchanged. Language selection applies to the optional panels;
it does not claim to translate the existing Nexus interface.

## Development verification

Run the normal checks in [CONTRIBUTING](../CONTRIBUTING.md). Optional isolated
checks do not enable the extension, use a real account, contact Xbox or install
a host service:

```sh
node --test scripts/desktop/gnome-experience.test.mjs
node scripts/ui/optional-features-smoke.mjs work/optional-features
```

Debian packaging is available with `npm run dist:deb`; AppImage remains the
default distribution command. Package scripts verify the exact installed native
binary/sandbox pair before setting sandbox permissions. Source checks and a
packaging fixture do not approve a stable release; the existing maintainer
validation process still applies.
