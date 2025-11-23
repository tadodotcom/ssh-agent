const core = require("@actions/core");
const child_process = require("node:child_process");
const fs = require("node:fs");
const crypto = require("node:crypto");
const { homePath, sshAgentCmd, sshAddCmd, gitCmd } = require("./paths.js");
const { keyFilePrefix } = require("./consts.js");
const { alterGitConfigWithRetry } = require("./utils.js");

try {
  const privateKey = core.getInput("ssh-private-key");
  const logPublicKey = core.getBooleanInput("log-public-key", {
    default: true,
  });
  const fetchGithubHostKeys = core.getBooleanInput("fetch-github-host-keys", {
    default: false,
  });

  if (!privateKey) {
    core.setFailed(
      "The ssh-private-key argument is empty. Maybe the secret has not been configured, or you are using a wrong secret name in your workflow file.",
    );

    process.exit(1);
  }

  const homeSsh = `${homePath}/.ssh`;
  fs.mkdirSync(homeSsh, { recursive: true });

  if (fetchGithubHostKeys) {
    console.log("Fetching GitHub host keys");
    try {
      const metaJson = child_process.execSync(
        "curl --silent https://api.github.com/meta",
        { encoding: "utf8" },
      );

      const meta = JSON.parse(metaJson);
      const knownHostsFile = `${homeSsh}/known_hosts`;
      const hostKeyLines = `${meta.ssh_keys.map((key) => `github.com ${key}`).join("\n")}\n`;
      fs.appendFileSync(knownHostsFile, hostKeyLines);
      console.log(
        `Added ${meta.ssh_keys.length} GitHub host key(s) to known_hosts`,
      );
    } catch (error) {
      console.warn(`Failed to fetch GitHub host keys: ${error.message}`);
    }
  }

  console.log("Starting ssh-agent");

  const authSock = core.getInput("ssh-auth-sock");
  const sshAgentArgs = authSock && authSock.length > 0 ? ["-a", authSock] : [];

  // Extract auth socket path and agent pid and set them as job variables
  child_process
    .execFileSync(sshAgentCmd, sshAgentArgs)
    .toString()
    .split("\n")
    .forEach((line) => {
      const matches = /^(SSH_AUTH_SOCK|SSH_AGENT_PID)=(.*); export \1/.exec(
        line,
      );

      if (matches && matches.length > 0) {
        // This will also set process.env accordingly, so changes take effect for this script
        core.exportVariable(matches[1], matches[2]);
        console.log(`${matches[1]}=${matches[2]}`);
      }
    });

  console.log("Adding private key(s) to agent");

  privateKey.split(/(?=-----BEGIN)/).forEach((key) => {
    child_process.execFileSync(sshAddCmd, ["-"], { input: `${key.trim()}\n` });
  });

  console.log("Key(s) added:");

  child_process.execFileSync(sshAddCmd, ["-l"], { stdio: "inherit" });

  console.log("Configuring deployment key(s)");

  child_process
    .execFileSync(sshAddCmd, ["-L"])
    .toString()
    .trim()
    .split(/\r?\n/)
    .forEach((key) => {
      const parts = key.match(/\bgithub\.com[:/]([_.a-z0-9-]+\/[_.a-z0-9-]+)/i);

      if (!parts) {
        if (logPublicKey) {
          console.log(
            `Comment for (public) key '${key}' does not match GitHub URL pattern. Not treating it as a GitHub deploy key.`,
          );
        }
        return;
      }

      const sha256 = crypto.createHash("sha256").update(key).digest("hex");
      const ownerAndRepo = parts[1].replace(/\.git$/, "");
      const keyFile = `${keyFilePrefix}-${sha256}`;

      fs.writeFileSync(`${homeSsh}/${keyFile}`, `${key}\n`, { mode: "600" });

      alterGitConfigWithRetry(() => {
        return child_process.execSync(
          `${gitCmd} config --global --replace-all url."git@${keyFile}.github.com:${ownerAndRepo}".insteadOf "https://github.com/${ownerAndRepo}"`,
        );
      });
      alterGitConfigWithRetry(() => {
        return child_process.execSync(
          `${gitCmd} config --global --add url."git@${keyFile}.github.com:${ownerAndRepo}".insteadOf "git@github.com:${ownerAndRepo}"`,
        );
      });
      alterGitConfigWithRetry(() => {
        return child_process.execSync(
          `${gitCmd} config --global --add url."git@${keyFile}.github.com:${ownerAndRepo}".insteadOf "ssh://git@github.com/${ownerAndRepo}"`,
        );
      });

      const sshConfig = `\nHost ${keyFile}.github.com\n    HostName github.com\n    IdentityFile ${homeSsh}/${keyFile}\n    IdentitiesOnly yes\n`;

      fs.appendFileSync(`${homeSsh}/config`, sshConfig);

      console.log(
        `Added deploy-key mapping: Use identity '${homeSsh}/${keyFile}' for GitHub repository ${ownerAndRepo}`,
      );
    });
} catch (error) {
  if (error.code === "ENOENT") {
    console.log(
      `The '${error.path}' executable could not be found. Please make sure it is on your PATH and/or the necessary packages are installed.`,
    );
    console.log(`PATH is set to: ${process.env.PATH}`);
  }

  core.setFailed(error.message);
}
