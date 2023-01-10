import "https://deno.land/x/dotenv@v3.2.0/load.ts";
import * as log from "https://deno.land/std@0.171.0/log/mod.ts";

/* Environment variables */

const CORE_KEEPER_SERVER_LOG_PATH = Deno.env.get("CORE_KEEPER_SERVER_LOG_PATH");
const DISCORD_WEBHOOK_URL = Deno.env.get("DISCORD_WEBHOOK_URL");

if (!CORE_KEEPER_SERVER_LOG_PATH || !DISCORD_WEBHOOK_URL) {
  log.error("Environment variables are not set.");
  Deno.exit(1);
}

/* Helper functions */

const getSplittedCoreKeeperServerLog = () => {
  const decoder = new TextDecoder("utf-8");

  const text = decoder.decode(
    Deno.readFileSync(CORE_KEEPER_SERVER_LOG_PATH),
  );

  const lines = text.split(/\n/);
  const filteredLines = lines.filter((line) => line !== "");

  return filteredLines;
};

const sendMessageToDiscord = async (content: string) => {
  try {
    await fetch(DISCORD_WEBHOOK_URL, {
      body: JSON.stringify({ content }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
  } catch (error) {
    log.error(error);
  }
};

/* States */

const state: {
  players: Record<string, string>;
} = {
  players: {},
};

/* Main */

const watcher = Deno.watchFs(CORE_KEEPER_SERVER_LOG_PATH);

for await (const event of watcher) {
  if (event.kind !== "modify") {
    continue;
  }

  let currentPlayers: Record<string, string> = {};

  const lines = getSplittedCoreKeeperServerLog();

  lines.forEach((line) => {
    const connected = line.match(/\[userid:(\d+)]\s+player\s+(.+)\s+connected/);
    const disconnected = line.match(/Disconnected\s+from\s+userid:(\d+)/);

    if (connected) {
      const [_, connectedUserId, connectedUserName] = connected;
      currentPlayers[connectedUserId] = connectedUserName;
    }

    if (disconnected) {
      const [_, disconnectedUserId] = disconnected;
      delete currentPlayers[disconnectedUserId];
    }
  });

  Object.keys(state.players).forEach((playerId) => {
    if (!currentPlayers[playerId]) {
      const playerName = state.players[playerId];
      log.info(`${playerName} (${playerId}) disconnected`);
      sendMessageToDiscord(
        `:outbox_tray: ${playerName} (${playerId})`,
      );
    }
  });

  Object.keys(currentPlayers).forEach((playerId) => {
    if (!state.players[playerId]) {
      const playerName = currentPlayers[playerId];
      log.info(`${playerName} (${playerId}) connected`);
      sendMessageToDiscord(`:inbox_tray: ${playerName} (${playerId})`);
    }
  });

  state.players = currentPlayers;
}
