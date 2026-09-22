import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { test } from "node:test";
import { createAdapter } from "@socket.io/redis-adapter";
import { createClient } from "redis";
import { Server } from "socket.io";
import { io as createSocketClient } from "socket.io-client";

const listen = async (server) => {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return server.address().port;
};

const closeIo = (io) => new Promise((resolve) => io.close(resolve));

test("Redis adapter delivers room events across two backend instances", async () => {
  const httpA = createServer();
  const httpB = createServer();
  const ioA = new Server(httpA);
  const ioB = new Server(httpB);
  const redisClients = Array.from({ length: 4 }, () =>
    createClient({ url: process.env.REDIS_URL || "redis://127.0.0.1:6379" }));
  const [pubA, subA, pubB, subB] = redisClients;
  let clientA;
  let clientB;

  try {
    await Promise.all(redisClients.map((client) => client.connect()));
    ioA.adapter(createAdapter(pubA, subA));
    ioB.adapter(createAdapter(pubB, subB));
    ioA.on("connection", (socket) => socket.join("user:a"));
    ioB.on("connection", (socket) => socket.join("user:b"));

    const [portA, portB] = await Promise.all([listen(httpA), listen(httpB)]);
    clientA = createSocketClient(`http://127.0.0.1:${portA}`, {
      transports: ["websocket"],
    });
    clientB = createSocketClient(`http://127.0.0.1:${portB}`, {
      transports: ["websocket"],
    });
    await Promise.all([once(clientA, "connect"), once(clientB, "connect")]);

    const callId = "cross-instance-call";
    const receivedByA = once(clientA, "matchmaking:matched");
    const receivedByB = once(clientB, "matchmaking:matched");
    ioB.to("user:a").emit("matchmaking:matched", { callId });
    ioA.to("user:b").emit("matchmaking:matched", { callId });
    const [[payloadA], [payloadB]] = await Promise.all([receivedByA, receivedByB]);

    assert.equal(payloadA.callId, callId);
    assert.equal(payloadB.callId, callId);
  } finally {
    clientA?.disconnect();
    clientB?.disconnect();
    await Promise.all([closeIo(ioA), closeIo(ioB)]);
    await Promise.all(redisClients.map((client) =>
      client.isOpen ? client.quit() : Promise.resolve()));
  }
});
