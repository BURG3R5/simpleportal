#!/usr/bin/env node
/* eslint-disable no-console */

const openurl = require("openurl");
const yargs = require("yargs");

const localtunnel = require("../localtunnel");
const { version } = require("../package");

require("dotenv").config();

const { argv } = yargs
  .usage("Usage: lt [port] [subdomain] <options>")
  .env(true)
  .positional("port", { describe: "Internal HTTP server port" })
  .positional("subdomain", { describe: "Request this subdomain" })
  .option("h", {
    alias: "host",
    describe: "Upstream server providing forwarding",
    default: process.env.DEFAULT_HOST,
  })
  .option("a", {
    alias: "local-alias",
    describe: "Alias of localhost, can be 0.0.0.0 or 127.0.0.1",
    default: "localhost",
  })
  .option("local-https", {
    describe: "Tunnel traffic to a local HTTPS server",
  })
  .option("local-cert", {
    describe: "Path to certificate PEM file for local HTTPS server",
  })
  .option("local-key", {
    describe: "Path to certificate key file for local HTTPS server",
  })
  .option("local-ca", {
    describe: "Path to certificate authority file for self-signed certificates",
  })
  .option("allow-invalid-cert", {
    describe:
      "Disable certificate checks for your local HTTPS server (ignore cert/key/ca options)",
  })
  .options("o", {
    alias: "open",
    describe: "Opens the tunnel URL in your browser",
  })
  .option("print-requests", {
    describe: "Print basic request info",
  })
  .boolean("local-https")
  .boolean("allow-invalid-cert")
  .boolean("print-requests")
  .help("help", "Show this help and exit")
  .version(version);

if (argv._.length !== 2) {
  yargs.showHelp();
  console.error("\nInvalid arguments: `port` and `subdomain` must be supplied");
  process.exit(1);
}

if (typeof argv._[0] !== "number") {
  yargs.showHelp();
  console.error("\nInvalid argument: `port` must be a number");
  process.exit(1);
}

(async () => {
  const tunnel = await localtunnel({
    port: argv._[0],
    subdomain: argv._[1],
    host: argv.host,
    local_alias: argv.localAlias,
    local_https: argv.localHttps,
    local_cert: argv.localCert,
    local_key: argv.localKey,
    local_ca: argv.localCa,
    allow_invalid_cert: argv.allowInvalidCert,
  }).catch((err) => {
    throw err;
  });

  tunnel.on("error", (err) => {
    throw err;
  });

  console.log("your url is: %s", tunnel.url);

  /**
   * `cachedUrl` is set when using a proxy server that support resource caching.
   * This URL generally remains available after the tunnel itself has closed.
   * @see https://github.com/localtunnel/localtunnel/pull/319#discussion_r319846289
   */
  if (tunnel.cachedUrl) {
    console.log("your cachedUrl is: %s", tunnel.cachedUrl);
  }

  if (argv.open) {
    openurl.open(tunnel.url);
  }

  if (argv["print-requests"]) {
    tunnel.on("request", (info) => {
      console.log(new Date().toString(), info.method, info.path);
    });
  }
})();
