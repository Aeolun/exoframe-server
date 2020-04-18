// npm modules
const os = require('os');
const fs = require('fs');
const path = require('path');
const mkdirp = require('mkdirp');

// our modules
const {getConfig, waitForConfig} = require('../config');
const docker = require('./docker');
const logger = require('../logger');
const {initNetwork} = require('./network');
const {getPlugins} = require('../plugins');
const {initTraefik} = require('./traefik');

// config vars
const baseFolder = path.join(os.homedir(), '.exoframe');

const getDockerAuthentication = tag => {
  let authconfig = undefined;
  const configFile = `${process.env.HOME}/.docker/config.json`;

  if (fs.existsSync(configFile)) {
    const authFileContent = fs.readFileSync(configFile);
    const authJson = JSON.parse(authFileContent.toString());
    const hostName = tag.substr(0, tag.indexOf('/'));

    if (authJson.auths[hostName] && authJson.auths[hostName].auth) {
      const details = new Buffer.from(authJson.auths[hostName].auth, 'base64').toString('ascii').split(':');

      authconfig = {
        'serveraddress': hostName,
        'username': details[0],
        'password': details[1]
      };
    }
  }
  return authconfig
}

exports.getDockerAuthentication = getDockerAuthentication

// pull image
const pullImage = tag =>
  new Promise(async (resolve, reject) => {
    let log = '';
    docker.pull(tag, {
      authconfig: getDockerAuthentication(tag)
    }, (err, stream) => {
      if (err) {
        logger.error('Error pulling:', err);
        reject(err);
        return;
      }
      stream.on('data', d => {
        const line = d.toString();
        log += line;
      });
      stream.once('end', () => resolve(log));
    });
  });
exports.pullImage = pullImage;

// export default function
exports.initDocker = async () => {
  await waitForConfig();

  logger.info('Initializing docker services...');
  // create exoframe network if needed
  const exoNet = await initNetwork();

  // get config
  const config = getConfig();

  // run init via plugins if available
  const plugins = getPlugins();
  logger.debug('Got plugins, running init:', plugins);
  for (const plugin of plugins) {
    // only run plugins that have init function
    if (!plugin.init) {
      continue;
    }

    const result = await plugin.init({config, logger, docker});
    logger.debug('Initing traefik with plugin:', plugin.config.name, result);
    if (result && plugin.config.exclusive) {
      logger.info('Init finished via exclusive plugin:', plugin.config.name);
      return;
    }
  }

  // run traefik init
  await initTraefik(exoNet);
};
