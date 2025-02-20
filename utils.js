const core = require("@actions/core");
module.exports = {
  alterGitConfigWithRetry,
};

const wait = (msec) =>
  new Promise((resolve, _) => {
    setTimeout(resolve, msec);
  });

function alterGitConfigWithRetry(alterFunction, maxTries = 3) {
  let tries = 0;
  while (tries < maxTries) {
    try {
      return alterFunction();
    } catch (error) {
      if (!error.message.includes("could not lock config file")) {
        throw error;
      }
      core.debug(error.message);
      tries++;
      if (tries === maxTries) {
        throw error;
      }
      (async () => {
        const delay = Math.floor(Math.random() * 2000);
        core.debug(`Retrying in ${delay}ms...`);
        await wait(delay);
      })();
    }
  }
}
