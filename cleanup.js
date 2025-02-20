const { execFileSync } = require('child_process');
const { keyFilePrefix } = require('./consts.js');
const { gitCmd, homePath, sshAgentCmd } = require('./paths.js');
const { alterGitConfigWithRetry } = require('./utils.js');
const fs = require('fs');
const os = require('os');

function killSshAgent() {
    try {
        console.log('Stopping SSH agent');
        execFileSync(sshAgentCmd, ['-k'], { stdio: 'inherit' });
    } catch (error) {
        console.log(error.message);
        console.log('Error stopping the SSH agent, proceeding anyway');
    }
}

function restoreGitConfig(maxTries = 3) {
    try {
        console.log('Restoring git config');
         const result = alterGitConfigWithRetry( () => {
            return execSync(`${gitCmd} config --global --get-regexp ".git@${keyFilePrefix}."`);
        });
        const sections = result.toString().split(os.EOL)
        .map( section => {
            return section.substring(0, section.indexOf('.insteadof'))
        })
        new Set(sections)
        .forEach(section => {
            if (section !== '') {
                console.log(`Removing git config section ${section}`);
                alterGitConfigWithRetry(() => {
                    return execSync(`${gitCmd} config --global --remove-section ${section}`)
                });
            }
        });
    } catch (error) {
        console.log(error.message);
        console.log('Error restoring git config, proceeding anyway');
    }
}

function removeCustomSshKeys() {
    const homeSsh = homePath + '/.ssh';
    try {
        console.log('Removing custom SSH keys');
        fs.readdirSync(homeSsh)
        .filter(file => file.startsWith(keyFilePrefix))
        .forEach(file => {
          const filePath = `${homeSsh}/${file}`;
          fs.rmSync(filePath);
          console.log(`Deleted file: ${filePath}`);
        });
    } catch (error) {
        console.log(error.message);
        console.log('Error removing custom SSH keys, proceeding anyway');
    }
}

function removeHostEntries() {
    console.log("Removing custom host entries")
    try{
        const sshConfigFile = homePath + '/.ssh/config';
        const input = fs.readFileSync(sshConfigFile, 'utf8');
        const lines = input.split('\n');
        const linesToKeep = [];
        let skip = false;

        for (const line of lines) {
            if (line.startsWith('Host ' + keyFilePrefix)) {
                skip = true;
            } else if (line.startsWith('Host ')) {
                skip = false;
            }

            if (!skip) {
                linesToKeep.push(line);
            }
        }

        fs.writeFileSync(sshConfigFile, linesToKeep.join('\n'));
    } catch (error) {
        console.log(error.message);
        console.log('Error removing custom host entries, proceeding anyway');
    }

}


killSshAgent();
restoreGitConfig();
removeCustomSshKeys();
removeHostEntries();
