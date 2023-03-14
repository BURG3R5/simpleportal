#!/usr/bin/env node

import quickportal from "../client.js";
import yargs from "yargs";
import openurl from "openurl";
import { config } from "dotenv";
import { createRequire } from "node:module";

const version = createRequire(import.meta.url)("../package.json").version;

config();

const command = yargs(process.argv.slice(2))
  .usage("Usage: quip <port> <subdomain> [...]")
  .env(true)
  .positional("port", {
    describe: "Internal HTTP server port",
    type: "number",
  })
  .positional("subdomain", {
    describe: "Request this subdomain",
    type: "string",
  })
  .options("h", {
    alias: "host",
    describe: "Upstream server providing forwarding",
    default: process.env.DEFAULT_HOST,
  })
  .options("a", {
    alias: "local-alias",
    describe: "Alias of localhost, can be 0.0.0.0 or 127.0.0.1",
    default: "localhost",
  })
  .options("local-https", {
    describe: "Tunnel traffic to a local HTTPS server",
  })
  .options("local-cert", {
    describe: "Path to certificate PEM file for local HTTPS server",
  })
  .options("local-key", {
    describe: "Path to certificate key file for local HTTPS server",
  })
  .options("local-ca", {
    describe: "Path to certificate authority file for self-signed certificates",
  })
  .options("allow-invalid-cert", {
    describe:
      "Disable certificate checks for your local HTTPS server (ignore cert/key/ca options)",
  })
  .options("o", {
    alias: "open",
    describe: "Opens the tunnel URL in your browser",
  })
  .options("print-requests", {
    describe: "Print basic request info",
  })
  .boolean("local-https")
  .boolean("allow-invalid-cert")
  .boolean("print-requests")
  .help()
  .config()
  .version(version);

const argv = command.argv;

if (argv._.length !== 2) {
  command.showHelp();
  console.error("\nInvalid arguments: `port` and `subdomain` must be supplied");
  process.exit(1);
}

if (typeof argv._[0] !== "number") {
  yargs.showHelp();
  console.error("\nInvalid argument: `port` must be a number");
  process.exit(1);
}

(async () => {
  const tunnel = await quickportal({
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
