# Optional renderer checks

Run after `npm ci`, with a Chromium executable available:

```sh
node scripts/ui/optional-features-smoke.mjs
```

Set `CHROME_BIN` to use a different Chromium executable. The first argument
selects the output folder; the optional second argument selects `mode`,
`optional` or `settings`. A separate `main` selection compares the actual default
App with the repository's checked-out `HEAD` App in Chromium, using the same
synthetic snapshot and styles. By default the three component fixtures run and save reports and watermarked PNGs
under `work/ui-optional-features`.

These fixtures render the actual Nexus components with synthetic profile,
controller, fullscreen and battery APIs. A private browser profile and HOME/XDG
directories isolate the run; it has no host display or D-Bus connection. A
verified browser network boundary permits only the temporary fixture origin.
The checks cover renderer behavior, without proving native IPC, physical
controller support, real fullscreen, restart or desktop integration.
