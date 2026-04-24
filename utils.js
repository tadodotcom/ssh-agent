const core = require("@actions/core");
module.exports = {
  alterGitConfigWithRetry,
};

function wait(msec) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, msec);
}

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
      const delay = 2000 + Math.floor(Math.random() * 2000);
      core.debug(`Retrying in ${delay}ms...`);
      wait(delay);
    }
  }
}
