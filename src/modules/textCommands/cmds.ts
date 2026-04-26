import {
  MessageCreateOptions,
  MessagePayload,
  PermissionFlagsBits,
} from "discord.js";
import { InvalidCommandUsageError } from "../../util/errors.js";
import { startJumble } from "../jumble.js";
import { CommandDef, guildPrefixMap } from "./index.js";
import { client } from "strife.js";

const specialIds: Record<string, number> = {
  "799565073374380063": 67676767,
  "1014588310036951120": 0,
  "1336737164691505246": 5173,
  "708860435482279977": 4562,
};

function seededRandom(min: number, max: number, seed: string): number {
  if (specialIds[seed]) return specialIds[seed];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    const char = seed.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  const random = Math.abs(hash) / 2147483648;
  return Math.floor(random * (max - min + 1)) + min;
}

export const commands: CommandDef[] = [
  {
    name: "jumble",
    aliases: ["j", "jumb"],
    async run({ message, args }) {
      const channel = message.channel;
      if (!channel.isSendable()) {
        return;
      }

      const type = args[0] ?? ("artist" as "artist" | "album" | "track");
      if (type !== "artist" && type !== "album" && type !== "track") {
        throw new InvalidCommandUsageError(
          'Invalid jumble type. Please specify "artist", "album", or "track".',
        );
      }
      await startJumble(
        channel,
        async (payload) => {
          const msg = await message
            .reply(payload)
            .catch(async () => channel.send(payload));

          return msg;
        },
        message.author.id,
        type,
      );
    },
  },
  {
    name: "setprefix",
    aliases: ["sp", "prefix", "pre", "pref"],
    async run({ message, args }) {
      let prefix = args[0];
      if (prefix === "default") prefix = "s.";
      const author = message.author;
      const guild = message.guild;
      if (!guild) {
        throw new InvalidCommandUsageError("This command is only for servers.");
      }

      const guildMember = await guild.members.fetch(author.id).catch((e) => {
        console.error(e);
        return null;
      });

      if (!guildMember) {
        throw new InvalidCommandUsageError("Internal error.");
      }

      if (!guildMember.permissions.has(PermissionFlagsBits.ManageGuild)) {
        throw new InvalidCommandUsageError(
          "Invalid usage. You must have the `ManageGuild` permission.",
        );
      }

      if (!prefix || prefix.length < 1) {
        throw new InvalidCommandUsageError(
          "Invalid prefix. Prefix length must be at least 1.",
        );
      }
      if (prefix.length > 32) {
        throw new InvalidCommandUsageError(
          "Invalid prefix. Prefix length must be at most 32. (why the heck are you doing this)",
        );
      }
      if (!/^[a-zA-Z0-9\.-_;:\[\]{}\-=_\+$&()*"'!?]+$/.test(prefix)) {
        throw new InvalidCommandUsageError(
          "Invalid prefix. Prefix must only contain alphanumeric characters and `.-_;:[]{}-=_+$&()*\"'!?`.",
        );
      }
      if (prefix === "s.") await guildPrefixMap.delete(guild.id);
      else await guildPrefixMap.set(guild.id, prefix);

      const payload: MessageCreateOptions = {
        content: `Successfully set bot prefix to \`${prefix}\``,
        allowedMentions: { parse: [] },
      };

      await message
        .reply(payload)
        .catch(async () =>
          message.channel.isSendable() ? message.channel.send(payload) : false,
        );
    },
  },
  {
    name: "hi",
    async run(ctx) {
      ctx.message.reply("hi");
    },
  },
  {
    name: "ping",
    aliases: ["p"],
    async run(ctx) {
      const initials = [
        "Contacting oracle...",
        "wawawawa",
        "owo",
        // rest of these are stolen from gdcolons robtop source leaks
        "Working on it",
        "Setting stuff up",
        "Loading",
        "Rewiring",
        "Getting ready",
        "Hold your horses",
        "Please wait",
        "Stealing some code",
        "Stealing loading messages",
        "Judging your account",
        "Finishing phone call",
        "Uninstalling Fortnite",
        "Ensuring you read these",
        "Loading a loading message",
        "Loading as slowly as possible",
        "Sending data through internet tubes",
        "Scanning for edgy black profile photos",
        "Finishing supper",
        "Your waiter will arrive shortly",
        "Fixing the ice cream machine",
        "Procrastinating",
        "Bending reality",
        "Ready player one",
        "Getting dunked",
        "Testing your patience",
        "but nobody came",
        "Asking for help",
        "Preparing cringe compilation",
        "lol is lol backwards",
        "And now for something completely different",
        "Loading each pixel",
        "Preparing hold music",
        "Deep frying",
        "Loading original content",
        "Waiting for Discord",
        "Proofraeding",
        "Getting milk from store",
        "Apologizing",
        "Repairing circuit board",
        "Pretending I'm a real person",
        "Cleaning your device",
        "oh look a butterfly",
        "Stealing your memes",
        "Ruining your day",
        "Locating Holy Grail",
        "Delaying schedule",
        "Training code monkeys",
        "Recompiling",
        "Slowing down time",
        "99 bottles of beer on the wall",
        "Awaiting donation",
        "Stopping racism",
        "Determining your fate",
        "Being productive",
        "Wallclipping",
        "DON'T MOVE",
        "Controlling Rewind",
        "Tying shoelaces",
        "Laughing at your search history",
        "Dusting cobwebs",
        "Setting up the scene",
        "Downloading more RAM",
        "Count down from ten",
        "Reloading",
        "Recharging",
        "Press the any key to continue",
        "beep boop",
        "HELP THEY'RE FORCING ME TO WRITE LOADING LINES",
        "Buying better servers",
        "Downloading entire internet",
        "Printing and mailing site to you",
        "Loading funny joke",
        "Adding some bugs",
        "Improving your day",
        "Bribing Sakurai",
        "Distracting guards",
        "Connecting to the internet",
        "Mastering spells",
        "Finding myself",
        "Preparing for trouble",
        "Making it double",
        "Protecting the world from devastation",
        "Waiting for the signal",
        "Smug dancing",
        "Finishing with the previous user",
        "Finding Waldo",
        "We live in a society",
        "Just a sec",
        "Stealing Infinity Stones",
        "Stretching",
        "Give me a minute or two",
        "Doing funny stuff",
        "Killing your data",
        "Removing Herobrine",
        "Generating chunks",
        "Hold up",
        "The end is never the end",
        "Confessing love",
        "Joining world",
        "Settling liquids",
        "Downloading killbot.exe",
        "Preparing darts",
        "Programmer is sleeping, please wait",
        "Counting to 1337",
        "Stealing loading messages from Geometry Dash",
        "Generating terrain",
        "Preparing DT cannon",
        "Serving your request",
        "Using turn signals",
        "Making a dramatic entrance",
        "Can I go home now",
        "I QUIT! -loading message guy",
        "Welcome back to WILL IT LOAD",
        "Laughing at your terrible internet",
        "Repairing boat",
        "Sealing leaks",
        "Stopping climate change",
        "oh hello there",
        "Skipping terms of service",
        "Waiting for jQuery",
        "Adjusting mirrors",
        "Hand-typing all the HTML",
        "Deleting system32",
        "Coding in HTML",
        "Starting arrays at 1",
        "Polishing",
        "Reforging",
        "Please do not power off your device",
        "No one is around to help",
        "Life is hard, life is stressful",
        "Fixing timed roles",
        "Raiding military base",
        "Trying to add timed roles without permissions",
        "I need peace and tranquility",
        "Pampering you to your heart's content",
        "Fluffing tail",
        "Riding on a horse",
        "Jacking in",
        "Loading messages or hold music. Your call",
        "h",
        "So it was the day of the big frog race",
        "Dramatically revealing mediocre web page",
        "Unfortunately I don't have any Smash tips for you",
        "Loading, do not power off your device",
        "Preparing for liftoff",
        "Entering the Gungeon",
        "Carrying the sun",
        "Brainstorming more geeky video game references",
        "Writing more of these loading messages at 1:00am",
        "Forgetting curly brackets",
        "Cleaning my room",
        "Taking hourly breaks to go outside",
        "Probably being less useful than you",
        "We should grab lunch some time",
        "Reassuring the client that they are beautiful",
        "Brushing twice a day for two minutes",
        "Applying makeup",
        "Applying deodorant",
        "Applying zit cream",
        "Restoring Curly's memory",
        "Overusing jQuery's append() function",
        "Randomizing randomizer",
        "Reciting pi",
        "Not vaccinating my children because I am stupid",
        "Asking nicely",
        "Realizing there's a better way to code this site",
        "Sprinkling on some JavaScript",
        "Respecting users even if they have Adblock",
        "Scanning for viruses",
        "The site's ugly but let's see you do better",
        "Stealing Geometry Dash's loading circle",
        "Trying to make you laugh",
        "So, you're finally awake",
        "Shiny chaining",
        "not funny, didn't laugh",
        "Setting my priorities",
        "Searching for more exciting loading icons",
        "Impatiently dragging the sun around",
        "Carrying the sun",
        "Glitching up the staircase",
        "Debunking terrible Hollow Knight theories",
        "Checking vibe",
        "Wrestling other bots for views",
        "Destroying other bots with facts and logic",
        "Casually cheating at soliatare",
        "Rendering",
        "Dotting the i's and j's",
        "Inserting more quarters",
        "Struggling to finish today's crossword",
        "Chucking wood",
        "Taking my sweet time",
        "I took nine million steps today",
        "Grating cheese",
        "Rewriting awful code",
        "Now where did I put my keys",
        "Imagine that it already loaded",
        "Vibe check",
        "CHEERS TO CAT FOOD",
        "Saying my five daily prayers",
        "Social distancing",
        "Breaching containment",
        "Constructing additional pylons",
        "Loading another loading screen",
        "Shredding evidence",
        "Deploying to production",
        "Randomizing randomizer",
        "Preheating to 350°",
        "Peeking at your camera roll",
        "Deleting enormous log files",
        "Press Z to load faster!",
        "Experiencing True Tranquility",
        "Planting a tree",
        "Casting explosion",
        "Consuming the chalice",
        "Making the world evil",
        "Leeching splashes",
        "Grinding Zealots",
        "Skipping Lakitu",
        "Bomb clipping",
        "Starting the rescue helicopter",
        "Charging the Spur",
        "Renewing SSL certificate",
        "Evading taxes",
        "Supporting Twitter artists",
        "Measuring Dunsparce",
        "Adding more cowbell",
        "Getting down to business",
        "1, 1, 1, uhhhhmm, 1",
        "Creating fake copyright claims",
        "Finding the person who asked",
        "Rewriting in Rust",
        "TURNING OFF CAPS LOCK",
        "Finding relevant XKCD",
        "Completing mission",
        "Watching walkthrough",
        "Locating impostor",
        "Swiping card",
        "Shhhhhhh",
        "Faking tasks",
        "Calculating love",
        "Calculating Ultimate Question",
        "Calculating deal with airline food",
        "Returning by death",
        "Making Dad proud",
        "Not adding global variables",
        "Skipping sponsorships",
        "Rigging gacha",
        "Trashing your bad suggestions",
        "Stealing kneecaps",
        "Defibrillating",
        "Cueing oneshots",
        "Patience; approaching",
        "I've been waiting for so long",
        "I can wait a little longer",
        "There my pager goes again",
        "chopin beets",
        "Spamming pseudos",
        "Faking Minecraft speedruns",
        "Speedbridging",
        "Bartering with suspiciously high luck",
        "Distributing binomials",
        "Placing random objects in blender",
        "Attempting to destroy Nokia",
        "Reciting Bee Movie script",
        "Waiting for Forge to launch",
        "Getting wifi anywhere you go",
        "Hold up ring ding ding ding ding",
        "Reposting augmented triad face",
        "Returning to monkey",
        "Asking Discord chat for more loading messages",
        "Digging straight down",
        "In 5... 4... 3... 2",
        "Screwing up center fourwide",
        "Buying more Pokémon plushies",
        "Googling Homestuck references",
        "Understanding Gex references",
        "Stealing Minecraft splashes",
        "Creating Twitter discourse",
        "Reading awful Twitter trends",
        "Looping that one song",
        "Skipping almost every song in my playlist",
        "Petting dog",
        "Consuming lasaga",
        "Stuffing my face as usual",
        "Blowing up Malaysia",
        "Working for exposure",
        "Desyncing Space Jam mashup",
        "Purchasing WinRAR",
        "Howling at the moon",
        "Trying to pronounce Touhou",
        "Get ready, here comes Kanye",
        "Getting funky",
        "Getting more machinegun",
        "Escaping furry lab",
        "Finding meaning of information",
        "Trying to find cell service",
        "Going to the buffet and walruses",
        "Travelling straight into the sun",
        "Writing a tune that really sucks",
        "Flipping iceberg",
        "Hastening pace",
        "Begging for free art",
        "Posting memes in #general",
        "ayo the pizza here",
        "Connection terminated",
        "Convincing friends to use FFmpeg",
        "Falling apart piece by piece",
        "Farming Reddit gold",
        "Waiting every night",
        "Growing a tails",
        "Leaving my child behind",
        "Freeing sanctuary",
        "Replanting nether wart",
        "Organizing photo album",
        "Delivering pizza",
        "get out of my head get out of my head",
        "Washing my hands",
        "Talking less, smiling more",
        "Grinding Reddit karma",
        "Stealing intelligence",
        "Making excuses",
        "Selling sea shells",
        "Waiting for the Wellerman",
        "I just can't refrain",
        "Jamming the keys",
        "Using proper rhythm",
        "Acting kind of sus!! (please laugh)",
        "Writing more, caring less",
        "Scheming, streaming",
        "Acting sus with no one around",
        "Ignoring my friends until I'm finally done",
        "Searching for Basil",
        "doin our taxes doin doin our taxes",
        "Bribing school president",
        "Fixing floating text",
        "Discombobulating",
        "Hopping over beans",
        "Searching for door hole",
        "Randomly generating humor",
        "Getting the banana",
        "Blocking hyperlink",
        "Becoming big shot",
        "Admiring the scenery",
        "AI Generating more loading messages",
        "Gathering loved ones",
        "(waiting for something to happen?)",
        "Requesting message content intent",
        "Removing dislikes",
        "flick, tap, flick, tap",
        "Screenshotting monkeys",
        "Obsessing over vocaloid",
      ];

      const normal = [
        "<AUTHOR> - what, you asked to be pinged!",
        "GREETINGS, HUMAN #<RNG>",
        "I'm here! Beep boop...",
        "All systems operational!",
        "May I take your order?",
        "Wow! I exist!",
        "I'm online! rubrubrubrubrub",
        "Well Seymour, I made it!",
        "Po-- just kidding, I prefer the term 'Table Tennis'",
        "who dis",
        "Ugh, I'm online. Now do whatever it is you need to do so I can get back to sleep",
        "I'm proud to say that the bot is indeed working!",
        "At your service!",
        "How do you do, fellow users?",
        "Let's get this bread",
        "What's poppin'?",
        "Hola todos, buenos días?",
        "HE COMES",
        "Prepare for trouble, and make it double!",
        "Hey Lois, I'm working!",
        "*is your bot running ;)*",
        "Okay, it's on!",
        "Let's we go, amigo!",
        "...uin 🐧",
        "PoooOOOoooOOOoooOOOoooNG!",
        "WHO DARES TO WAKE ME FROM MY SLUMBER?",
        "I'm fast as frick, boy!",
        "Polo!",
        "Alola!",
        "uwu",
        'I have been pinged!.. or is it "pung"?',
        "He lives!",
        "Sorry, but as you can see I'm offline.",
        "...Ladies!",
        "01010000 01101111 01101110 01100111 00100001",
        "hi how are ya",
        "Are you having the usual?",
        "*bot noises*",
        "Ready for battle!",
        "What next?",
        "Hey baby, how's it going?",
        "THIS IS IT LUIGI",
        "Heart's beatin'",
        "It's gamer time",
        "We rollin'!",
        "This. Beat. Is non. Stop!",
        "I'm in the house!",
        "GOOD MORNING GAMERS!",
        "You're just doing these for the messages aren't you",
        "Avengers, assemble!",
        "I AM SPEED",
        "Good morning, USA!",
        "It's-a go time!",
        "Technology is great when it works",
        "Ret-2-Go!",
        'I never really found "pong" that funny...',
        "API response any% speedrun",
        "Waiting for something to happen?",
        "HEY HEY, <USERNAME>-SAN!!",
        "Selfdestructing in:",
        "Echo! Echo! echo...",
        "It is good day to be not dead!",
        "How was the fall?",
        "What can I do for you master~",
        "Hey you what you gonna do",
        "So, you're finally awake",
        "Hello world!",
        "Boy, it's a scorcher out there!",
        "Rea-dy, Get-set...",
        "Greetings, <Username>. Is there something I can help you with?",
        "There my pager goes again",
        "I haven't seen ping like this since Jackbox night at <servername>",
        "ayo the pizza here",
        "hi there hello",
        "We're riding on the internet!",
        "good morning rdl",
        "She texted back!",
        "hey what's up hello",
        "I'm here I'm here",
        "It appears my servers are, good enough",
        "Works for me",
        "Discord API number of the day:",
        "How exciting!",
        "Alright everybody, um, let's beat these guys!",
        "TAP IN! 📲",
        "This ping is what all true bots strive for",
        "Every ping costs two cents",
        "Are you not entertained?",
        "ayo that's the plug at the door",
      ];
      const slow = [
        "On the bright side, things could definitely be worse",
        "Hey, at least you're not paying for it",
        "Oh, sorry, I fell asleep while it was pinging",
        "I swear it's not my fault",
        "Sorry for the delay, my mom walked in",
        "Sorry to keep you waiting, the pizza man just arrived",
        "Maybe you should consider buying priority queue",
        "Thank you Discord API, very cool",
        "You win some, you lose some",
        "My friends call me Internet Explorer. Oh wait, I have none!",
        "Agh, those are rookie numbers",
        "All systems opera-- oh jeez that is NOT supposed to happen",
        "I suppose the tortoise won this time",
        "My fault? No, of course it's Discord silly!",
        "Looks like we're experiencing some turbulence. Buckle those seatbelts",
        "I swear I'm better than this babe",
        "<SECS> seconds and counting. Not my proudest time",
        "<SECS-1>... <SECS>..- oh thank god that took forever",
        "ZAMN! She's <SECS>",
        "Sorry about that, my code is just that messy",
        "What have you never seen <SECS> second ping before?",
        "I'M SORRY I'M SORRY I'M SORRY I'M SORRY",
        "Try complaining, that usually lowers the ping",
        'What do you mean <SECS> second ping isn\'t "as advertised"??',
        "It's snail time",
        "hey craig did you fix the high ping issue yet",
        "i'm a bot who loves to snooze",
      ];

      const sent = await ctx.message.reply(
        initials[Math.floor(Math.random() * initials.length)],
      );

      const latency = sent.createdTimestamp - ctx.message.createdTimestamp;
      const isSlow = latency > 800;
      const array = isSlow ? slow : normal;
      let updateMessage = array[Math.floor(Math.random() * array.length)];
      const extra = latency;
      updateMessage = updateMessage
        .replace(/<AUTHOR>/g, ctx.message.author.toString())
        .replace(/<Username>/g, ctx.message.author.username)
        .replace(/<USERNAME>/g, ctx.message.author.username.toUpperCase())
        .replace(
          /<servername>/g,
          ctx.message.guild
            ? ctx.message.guild.name
            : `${ctx.message.author.username}'s DMs`,
        )
        .replace(
          /<RNG>/g,
          seededRandom(0, 10000000, ctx.message.author.id)
            .toString()
            .padStart(8, "0"),
        )
        .replace(/<SECS>/g, Math.floor(extra / 1000).toString())
        .replace(/<SECS-1>/g, (Math.floor(extra / 1000) - 1).toString());
      await sent.edit(
        updateMessage +
          `\n-# Msg latency: \`${latency}ms\` - WS latency: \`${client.ws.ping}ms\``,
      );
    },
  },
];
