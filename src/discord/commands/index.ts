import { BotCommand } from "../types";
import { checkNowCommand } from "./checknow";
import { latestCommand } from "./latest";
import { newestCommand } from "./newest";
import { removeChannelCommand } from "./removechannel";
import { searchCommand } from "./search";
import { setChannelCommand } from "./setchannel";
import { statusCommand } from "./status";
import { setChannelAnimeCommand } from "./setchannelAnime";
import { removeChannelAnimeCommand } from "./removechannelAnime";
import { animeLatestCommand } from "./animeLatest";
import { animeNewestCommand } from "./animeNewest";
import { animeSearchCommand } from "./animeSearch";

export const commands: BotCommand[] = [
  setChannelCommand,
  removeChannelCommand,
  statusCommand,
  checkNowCommand,
  latestCommand,
  newestCommand,
  searchCommand,
  setChannelAnimeCommand,
  removeChannelAnimeCommand,
  animeLatestCommand,
  animeNewestCommand,
  animeSearchCommand,
];

export const commandMap = new Map<string, BotCommand>();
for (const cmd of commands) {
  commandMap.set(cmd.data.name, cmd);
}
