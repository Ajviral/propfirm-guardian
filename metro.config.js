const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.blockList = [
  /.*propfirm-guardian-server.*/,
  /.*\/server\.js/,
];

module.exports = config;
