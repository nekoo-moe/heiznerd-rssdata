import { BotCommand } from "../types";
import { animeLatestCommand } from "./animeLatest";
import { animeNewestCommand } from "./animeNewest";
import { animeRemoveChannelCommand } from "./removechannelAnime";
import { animeSearchCommand } from "./animeSearch";
import { animeSetChannelCommand } from "./setchannelAnime";
import { checkNowCommand } from "./checknow";
import { mangaLatestCommand } from "./latest";
import { mangaNewestCommand } from "./newest";
import { mangaRemoveChannelCommand } from "./removechannel";
import { mangaSearchCommand } from "./search";
import { mangaSetChannelCommand } from "./setchannel";
import { statusCommand } from "./status";

export const commands: BotCommand[] = [
  // Manga (Cuutruyen) commands
  mangaSearchCommand,
  mangaLatestCommand,
  mangaNewestCommand,
  mangaSetChannelCommand,
  mangaRemoveChannelCommand,

  // Anime (AnimeVietsub) commands
  animeSearchCommand,
  animeLatestCommand,
  animeNewestCommand,
  animeSetChannelCommand,
  animeRemoveChannelCommand,

  // System commands
  statusCommand,
  checkNowCommand,
];

export const commandMap = new Map<string, BotCommand>();
for (const cmd of commands) {
  commandMap.set(cmd.data.name, cmd);
}
