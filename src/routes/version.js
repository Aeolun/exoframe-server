// npm modules
const fetch = require('node-fetch');
const cmp = require('semver-compare');

// our modules
const logger = require('../logger');
const docker = require('../docker/docker');
const pkg = require('../../package.json');

// urls for tags request
const exoServerUrl = `https://api.github.com/repos/exoframejs/exoframe-server/releases`;
const traefikUrl = 'https://api.github.com/repos/containous/traefik/releases';

const getLatestVersion = async url => {
  const res = await fetch(url).then(r => r.json());
  const latestRelease = res.filter(r => !r.draft && !r.prerelease).shift();
  return latestRelease.tag_name;
};

module.exports = fastify => {
  fastify.route({
    method: 'GET',
    path: '/version',
    async handler(request, reply) {
      try {
        // get version of traefik
        let traefikVersion = 'none';
        const allImages = await docker.listImages();
        const traefik = allImages.find(img => img.RepoTags && img.RepoTags.find(t => t.includes('traefik')));

        if (traefik && traefik.Labels['org.opencontainers.image.version']) {
          traefikVersion = traefik.Labels['org.opencontainers.image.version'];
        }
        // get latest versions
        const lastServerTag = await getLatestVersion(exoServerUrl);
        const lastTraefikTag = await getLatestVersion(traefikUrl);

        logger.debug("Current version: " + pkg.version);
        logger.debug("Last server tag: " + lastServerTag);
        logger.debug("Last traefik tag: " + lastTraefikTag);
        logger.debug("Current traefik version: " + traefikVersion);
        // reply
        reply.code(200).send({
          server: pkg.version,
          latestServer: lastServerTag,
          serverUpdate: cmp(lastServerTag, pkg.version) > 0,
          traefik: traefikVersion,
          latestTraefik: lastTraefikTag,
          traefikUpdate: cmp(lastTraefikTag, traefikVersion) > 0,
        });
      } catch (error) {
        logger.warn(error);
        reply.code(500).send({error});
      }
    },
  });
};
