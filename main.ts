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
  previousContentNumberOfLines: number;
  players: Record<string, {
    id: string;
    name: string;
  }>;
} = {
  previousContentNumberOfLines: getSplittedCoreKeeperServerLog().length,
  players: {},
};

/* Main */

const watcher = Deno.watchFs(CORE_KEEPER_SERVER_LOG_PATH);

for await (const event of watcher) {
  if (event.kind !== "modify") {
    continue;
  }

  const lines = getSplittedCoreKeeperServerLog();
  const diff = state.previousContentNumberOfLines - lines.length;

  if (diff === 0) {
    continue;
  }

  lines.slice(diff).forEach((line) => {
    const connected = line.match(/\[userid:(\d+)]\s+player\s+(.+)\s+connected/);

    if (connected) {
      const [_, connectedUserId, connectedUserName] = connected;

      state.players = {
        ...state.players,
        [connectedUserId]: {
          id: connectedUserId,
          name: connectedUserName,
        },
      };

      log.info(`${connectedUserName} (${connectedUserId}) connected`);
      sendMessageToDiscord(
        `:inbox_tray: ${connectedUserName} (${connectedUserId})`,
      );
    }

    const disconnected = line.match(/Disconnected\s+from\s+userid:(\d+)/);

    if (disconnected) {
      const [_, disconnectedUserId] = disconnected;
      const player = state.players[disconnectedUserId];

      if (!player) {
        log.error(
          `:thinking: There is no player matching \`${disconnectedUserId}\`.`,
        );
        return;
      }

      log.info(`${player.name} (${player.id}) disconnected`);
      sendMessageToDiscord(`:outbox_tray: ${player.name} (${player.id})`);

      delete state.players[disconnectedUserId];
    }
  });

  state.previousContentNumberOfLines = lines.length;
}
