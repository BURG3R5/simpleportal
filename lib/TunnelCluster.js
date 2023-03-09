import { EventEmitter } from "events";

import Debug from "debug";
import fs from "fs";
import net from "net";
import tls from "tls";

import HeaderHostTransformer from "./HeaderHostTransformer";

const debug = Debug("tunnelclient");

// manages groups of tunnels
export default class TunnelCluster extends EventEmitter {
  constructor(opts = {}) {
    super(opts);
    this.opts = opts;
  }

  open() {
    const opt = this.opts;

    // Prefer IP if returned by the server
    const remoteHostOrIp = opt.remote_ip || opt.remote_host;
    const remotePort = opt.remote_port;
    const localAlias = opt.local_alias || "localhost";
    const localPort = opt.local_port;
    const localProtocol = opt.local_https ? "https" : "http";
    const allowInvalidCert = opt.allow_invalid_cert;

    debug(
      "establishing tunnel %s://%s:%s <> %s:%s",
      localProtocol,
      localAlias,
      localPort,
      remoteHostOrIp,
      remotePort
    );

    // connection to localtunnel server
    const remote = net.connect({
      host: remoteHostOrIp,
      port: remotePort,
    });

    remote.setKeepAlive(true);

    remote.on("error", (err) => {
      debug("got remote connection error", err.message);

      // emit connection refused errors immediately, because they
      // indicate that the tunnel can't be established.
      if (err.code === "ECONNREFUSED") {
        this.emit(
          "error",
          new Error(
            `connection refused: ${remoteHostOrIp}:${remotePort} (check your firewall settings)`
          )
        );
      }

      remote.end();
    });

    const connLocal = () => {
      if (remote.destroyed) {
        debug("remote destroyed");
        this.emit("dead");
        return;
      }

      debug(
        "connecting locally to %s://%s:%d",
        localProtocol,
        localAlias,
        localPort
      );
      remote.pause();

      if (allowInvalidCert) {
        debug("allowing invalid certificates");
      }

      const getLocalCertOpts = () =>
        allowInvalidCert
          ? { rejectUnauthorized: false }
          : {
              cert: fs.readFileSync(opt.local_cert),
              key: fs.readFileSync(opt.local_key),
              ca: opt.local_ca ? [fs.readFileSync(opt.local_ca)] : undefined,
            };

      // connection to local http server
      const local = opt.local_https
        ? tls.connect({
            host: localAlias,
            port: localPort,
            ...getLocalCertOpts(),
          })
        : net.connect({ host: localAlias, port: localPort });

      const remoteClose = () => {
        debug("remote close");
        this.emit("dead");
        local.end();
      };

      remote.once("close", remoteClose);

      // TODO some languages have single threaded servers which makes opening up
      // multiple local connections impossible. We need a smarter way to scale
      // and adjust for such instances to avoid beating on the door of the server
      local.once("error", (err) => {
        debug("local error %s", err.message);
        local.end();

        remote.removeListener("close", remoteClose);

        if (err.code !== "ECONNREFUSED" && err.code !== "ECONNRESET") {
          return remote.end();
        }

        // retrying connection to local server
        setTimeout(connLocal, 1000);
      });

      local.once("connect", () => {
        debug("connected locally");
        remote.resume();

        let stream = remote;

        // if user requested specific local host
        // then we use host header transform to replace the host header
        if (opt.local_alias) {
          debug("transform Host header to %s", opt.local_alias);
          stream = remote.pipe(
            new HeaderHostTransformer({ host: opt.local_alias })
          );
        }

        stream.pipe(local).pipe(remote);

        // when local closes, also get a new remote
        local.once("close", (hadError) => {
          debug("local connection closed [%s]", hadError);
        });
      });
    };

    remote.on("data", (data) => {
      const match = data.toString().match(/^(\w+) (\S+)/);
      if (match) {
        this.emit("request", {
          method: match[1],
          path: match[2],
        });
      }
    });

    // tunnel is considered open when remote connects
    remote.once("connect", () => {
      this.emit("open", remote);
      connLocal();
    });
  }
}
