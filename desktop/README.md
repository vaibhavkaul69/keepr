# Keepr Desktop

A menu bar app that keeps your task list for the day and reminds you about it with desktop notifications. A notification shows only the task's title and description.

## Run it

```bash
cd desktop
npm install
npm start
```

The first time a reminder fires, macOS asks whether to allow notifications. Allow them. While you run from source, they show up as coming from "Electron".

## What it does

- **The receipt.** The window is a paper receipt of the promises you made yourself today. Finish a task and it gets a KEPT stamp. The totals show what you promised, kept and still owe.
- **Tasks.** Add what you promised yourself today: a title and, if you like, a description. Clicking a notification opens Keepr on that task. Each task can have its own reminders:
  - only the daily nudges
  - at set times every day, like `11:00, 14:00, 17:00`
  - every N minutes, for the next N hours or until done ("every 60 min for the next 12 hours")
  - once, at a set date and time
- **Daily nudges.** At the times you pick in Settings, every open task gets its own notification. The default is 10:00, 12:00, 14:00, 16:00 and 18:00.
- **Morning check-in.** The first time you open or unlock the laptop on a new day, Keepr shows what you finished yesterday and what is still open, then asks you to plan today.
- **Menu bar.** Closing the window keeps Keepr running in the menu bar. The icon shows how many tasks are open. The menu has two items: Open Keepr and Quit Keepr.
- **Snooze** moves a task's next reminder 15 minutes out. **Pause** stops all reminders for an hour. Reminders due during a pause are skipped.
- A reminder missed while the laptop was asleep fires once when it wakes, not once for every slot it missed.

## Where data lives

- Run from source (`npm start`): `desktop/data/keepr.json`. Git ignores this file.
- Packaged app: `~/Library/Application Support/Keepr/keepr.json`, because a packaged app can't write inside itself.

If the data file can't be read, Keepr renames it to `keepr.json.broken-<time>` and starts fresh, so your old data is never deleted.

## Start at login

This is on by default and can be turned off in Settings.

- Run from source on macOS: Keepr writes `~/Library/LaunchAgents/com.keepr.desktop.plist`, which starts it from this folder at login. Keepr rewrites the file every time it starts, so it follows the folder if you move it.
- Packaged app: uses the normal system login item.

It starts hidden in the menu bar. On a new day, the morning check-in opens the window.

## Install the Mac app

```bash
npm run pack
rm -rf /Applications/Keepr.app && cp -R dist/mac-arm64/Keepr.app /Applications/
open -a Keepr
```

`npm run pack` builds `dist/mac-arm64/Keepr.app`. `npm run dist` builds a `.dmg` instead. Both are signed with your Apple Development certificate when you have one.
To update, quit Keepr from the menu bar and run the three steps again. Your data stays in Application Support.

## Icon

`assets/icon.png` is the window and notification icon. `build/icon.icns` is the Mac app icon. Both come from `brand/icon.png` at the repo root.

## Code layout

| File | What it does |
| --- | --- |
| `src/main/main.js` | Starts the app, runs the reminder check every 20 seconds, and handles calls from the window |
| `src/main/schedule.js` | Checks schedules and works out the next reminder time (pure) |
| `src/main/reminders.js` | Finds due reminders and moves them to their next time (pure) |
| `src/main/tasks.js` | Adds, edits, finishes, snoozes and removes tasks (pure) |
| `src/main/messages.js` | Reminder text for each tone (pure) |
| `src/main/view.js` | Builds the data the window shows, including yesterday's summary (pure) |
| `src/main/settings.js` | Checks settings (pure) |
| `src/main/store.js` | Reads and writes the data file |
| `src/main/notify.js` | Shows desktop notifications |
| `src/main/window.js` | The app window, which hides to the menu bar when closed |
| `src/main/tray.js` | The menu bar icon and menu |
| `src/main/startup.js` | Start at login |
| `src/preload.js` | The only calls the window can make into the app |
| `src/renderer/` | The window: plain HTML, CSS and JS |
