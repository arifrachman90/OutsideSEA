'use strict';

let _debug = false;

function setDebug(enabled) {
  _debug = !!enabled;
}

function info(msg, ...args) {
  console.log(`[INFO]  ${msg}`, ...args);
}

function success(msg, ...args) {
  console.log(`[OK]    ${msg}`, ...args);
}

function warn(msg, ...args) {
  console.warn(`[WARN]  ${msg}`, ...args);
}

function error(msg, ...args) {
  console.error(`[ERROR] ${msg}`, ...args);
}

function debug(msg, ...args) {
  if (_debug) {
    console.log(`[DEBUG] ${msg}`, ...args);
  }
}

function section(title) {
  console.log('');
  console.log(`${'─'.repeat(60)}`);
  console.log(`  ${title}`);
  console.log(`${'─'.repeat(60)}`);
}

module.exports = { setDebug, info, success, warn, error, debug, section };
