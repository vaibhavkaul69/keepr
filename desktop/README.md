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

- **Home is for adding promises.** The first thing you see is "what's your next promise?". Type a title, add a description if you like, pick when to be reminded, and press **Print promise**.
- **Reminder choices for a task:**
  - only the daily nudges
  - every minute, from the next minute until the end of today
  - every hour on the hour, 6 am to 12 midnight, every day. The first one is the next full hour: set at 7:51 pm, it goes 8, 9, 10, 11 and 12, then 6 am onwards the next day. It repeats daily until you mark the task kept.
  - at set times every day, like `11:00, 14:00, 17:00`
  - once, at a set date and time
- **Two lists**, opened from home:
  - **Today's promises**: open tasks added today, plus everything you kept today.
  - **Carried over**: open tasks from earlier days, grouped by the day you promised them ("Fri 25 Sept · promised, not kept"), newest day first. **move to today** on a task, **move all to today** at the top, or **Move to today** in its details brings it back to Today's promises. Its reminders start again, and the days it missed stay in its details.
- **Details.** Click a task, or its notification, to see its description, schedule, next reminder and status. Snooze, edit and void are there too. **← back** or Esc goes back.
- **Notifications** show only the task title and its description.
- **Daily nudges.** At the times set in Settings, every open task gets its own notification. The default is 10:00, 12:00, 14:00, 16:00 and 18:00.
- **Carried-over reminder.** Once a day, at 11:00 by default, every task carried over from an earlier day gets its own notification. Change the time in Settings, or leave it empty to turn it off.
- A task gets at most one notification per check, even when its own reminder, a nudge and the carried-over reminder are all due together.
- **Morning check-in.** The first time you open or unlock the laptop on a new day, Keepr shows how yesterday went and asks you to plan today.
- **Menu bar.** Closing the window keeps Keepr running in the menu bar. The icon shows how many tasks are open. The menu has two items: Open Keepr and Quit Keepr.
- **Pause** stops all reminders for an hour. Reminders due during a pause are skipped.
- A reminder missed while the laptop was asleep fires once when it wakes, not once for every slot it missed.

## Webhook

In Settings, add a webhook URL and, if the server needs them, headers such as `Authorization: Bearer …`.

- **One message per batch.** All reminders due at the same moment go in one request. So a daily nudge with 5 open tasks is one message, not 5.
- **One at a time.** Requests are queued and start at least 1.5 seconds apart, so Slack never gets a burst.
- **Nightly summary.** At 23:00 by default, one message lists every promise still open, grouped by the day it was promised for. It still sends when nothing is left over, so you know the day is clear. Change the time in Settings, or leave it empty to turn it off.
- The morning check-in and "send a test reminder" also go through the queue.
- A failed request is logged and skipped, with no retry. Desktop notifications show either way.

Every request is one JSON message:

```json
{
  "app": "Keepr",
  "kind": "reminders",
  "title": "Keepr reminder",
  "sections": [
    {
      "heading": "You promised yourself today",
      "tasks": [
        { "taskId": "…", "title": "Open chargebacks", "description": "Two to be solved today",
          "promisedFor": "2026-09-27", "dueText": "Fulfil by Sun, 27 Sept, midnight" }
      ]
    },
    {
      "heading": "Still owed from earlier days",
      "tasks": [
        { "taskId": "…", "title": "Test juspay payments", "description": "",
          "promisedFor": "2026-09-25", "dueText": "Promised for Fri, 25 Sept, not kept" }
      ]
    }
  ],
  "text": "Keepr reminder\n\nYou promised yourself today\n• Open chargebacks: …",
  "content": "(same as text)",
  "sentAt": "2026-09-27T15:30:00.000Z"
}
```

- `kind` is `reminders`, `leftover` (the nightly summary), `check-in` (has a `note` and no sections) or `test`.
- `text` (Slack) and `content` (Discord) hold the whole message as plain text, so a plain Slack or Discord webhook URL works as is.
- `dueText` is already formatted in the laptop's time zone.
- Headers are saved in the data file as plain text, so treat that file like a password file.
- To post to the PeerUp #keepr Slack channel, use `https://api.peerup.co.in/internal/keepr/alerts`. It needs no headers.

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
