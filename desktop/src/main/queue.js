const { SEND_GAP_MS } = require('./constants');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let chain = Promise.resolve();
let lastStartedAt = 0;

// Runs jobs one at a time, each starting at least 1 s after the last, so notifications and Slack messages never
// arrive in a burst. Resolves with the job's result. A failing job does not stop the ones after it.
function enqueue(job) {
  const result = chain.then(async () => {
    const wait = lastStartedAt + SEND_GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastStartedAt = Date.now();
    return job();
  });
  chain = result.catch(() => {});
  return result;
}

module.exports = { enqueue };
