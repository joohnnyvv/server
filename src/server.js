const http = require("http");
const express = require("express");
const cors = require("cors");
const app = express();
app.use(cors());
app.use(express.json());
const WebSocket = require("ws");
const { Ableton } = require("ableton-js");
const { CuePoint } = require("ableton-js/ns/cue-point");
const { EventEmitter } = require("events");

const server = http.createServer();

const wss = new WebSocket.Server({ server });

const ableton = new Ableton({ logger: console });

let globalMergedCues = [];

const selectedSongIndexEmitter = new EventEmitter();
const selectedPartIndexEmitter = new EventEmitter();
const currentSongProgressEmitter = new EventEmitter();
const currentPartProgressEmitter = new EventEmitter();
const cueEventEmitter = new EventEmitter();

const extractAdditionalInfo = (name) => {
  const startIndex = name.indexOf("{");
  const endIndex = name.indexOf("}");
  if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
    const additionalInfoStr = name.substring(startIndex, endIndex + 1);
    try {
      return JSON.parse(additionalInfoStr);
    } catch (error) {
      console.error(`Failed to parse JSON from cue name: ${name}`, error);
      return {};
    }
  }
  return {};
};


const mergeCues = (cues) => {
  //console.log("Processing cues:", cues);
  const pairs = [];
  let currentSong = null;
  let currentSongPartsCues = [];

  cues.forEach((cue, index) => {
    if (cue.name.includes("<end>")) {
      if (currentSong) {
        const addInfo = extractAdditionalInfo(currentSong.name);
  
        // Safely handle the tempo property
        const tempoStr = addInfo.tempo ? String(addInfo.tempo) : "120BPM"; // Default tempo if undefined
  
        // Calculate the song length in seconds.
        const calculatedSongLength =
          ((cue.time - currentSong.time)) /
          (parseInt(tempoStr.replace(/[^0-9]/g, "")) / 60);
  
        if (currentSong.name.includes("{") && currentSong.name.includes("}")) {
          const clearedCueName = currentSong.name.split("{").shift();
          currentSong.name = clearedCueName;
        }
  
        pairs.push({
          song: [currentSong, cue],
          additionalInfo: addInfo,
          doesStop: true,
          songLengthInBars: cue.time - currentSong.time,
          songLengthInSec: calculatedSongLength,
          songPartsCues: currentSongPartsCues,
        });
  
        currentSong = null;
        currentSongPartsCues = [];
      }
    } else if (cue.name.startsWith(">")) {
      if (index < cues.length - 1) {
        const nextCue = cues[index + 1];
        const cueLength = nextCue.time - cue.time;
        cue.name = cue.name.substr(2);
        currentSongPartsCues.push({ ...cue, length: cueLength });
      }
    } else {
      currentSong = cue;
    }
  });

  globalMergedCues = pairs;
  return pairs;
};

const fetchCues = async () => {
  try {
    await ableton.start();
    const cues = await ableton.song.get("cue_points");
    const mergedCues = mergeCues(cues.map((c) => c.raw));
    return mergedCues;
  } catch (error) {
    console.error("Error fetching cues:", error);
    throw error;
  }
};

app.get("/get-tempo", async (req, res) => {
  try {
    await ableton.start();
    const tempo = await ableton.song.get("tempo"); // Adjust according to your API
    res.status(200).json({ tempo });
  } catch (error) {
    console.error("Error fetching tempo:", error);
    res.status(500).send("Error fetching tempo");
  }
});

ableton
  .start()
  .then(() => {
    console.log("Ableton client started successfully");
    ableton.song.addListener("current_song_time", (time) => {
      wss.clients.forEach(async (client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ type: "song_time", time }));
  
          // Check if globalMergedCues is not empty
          if (globalMergedCues.length > 0) {
            const currentSongIndex = globalMergedCues.findIndex(
              (cue) => cue.song[0].time <= time && cue.song[1].time >= time
            );
  
            // Ensure currentSongIndex is valid and globalMergedCues has the song at currentSongIndex
            if (currentSongIndex !== -1 && globalMergedCues[currentSongIndex]) {
              const currentSong = globalMergedCues[currentSongIndex];
              const currentPartIndex = currentSong.songPartsCues.findIndex(
                (partCue, i) => {
                  return (
                    partCue.time <= time && partCue.time + partCue.length > time
                  );
                }
              );
  
              const currentSongProgress =
                (time - currentSong.song[0].time) / currentSong.songLengthInBars;
              currentSongProgressEmitter.emit(
                "songProgressChanged",
                currentSongProgress * 100
              );
  
              if (currentPartIndex !== -1) {
                const currentPartCue = currentSong.songPartsCues[currentPartIndex];
                if (currentPartCue) {
                  const currentPartProgress =
                    (time - currentPartCue.time) / currentPartCue.length;
                  currentPartProgressEmitter.emit(
                    "partProgressChanged",
                    currentPartProgress * 100
                  );
                }
              }
  
              selectedSongIndexEmitter.emit(
                "selectedSongIndexChanged",
                currentSongIndex
              );
              selectedPartIndexEmitter.emit(
                "selectedPartIndexChanged",
                currentPartIndex
              );
  
              // Handle automatic cue jumping
              if (
                currentSongIndex !== -1 &&
                globalMergedCues[currentSongIndex].song[1].time ===
                  parseInt(time.toFixed(0))
              ) {
                const nextIndex = currentSongIndex + 1;
                if (!globalMergedCues[currentSongIndex].doesStop) {
                  selectedSongIndexEmitter.emit(
                    "selectedSongIndexChanged",
                    nextIndex
                  );
                  const cuePoint = new CuePoint(
                    ableton,
                    globalMergedCues[nextIndex].song[0]
                  );
                  await cuePoint.jump();
                } else {
                  await ableton.song.stopPlaying();
                  const cuePoint = new CuePoint(
                    ableton,
                    globalMergedCues[nextIndex].song[0]
                  );
                  await cuePoint.jump();
                  selectedSongIndexEmitter.emit(
                    "selectedSongIndexChanged",
                    nextIndex
                  );
                }
              }
            }
          }
        }
      });
    });

    ableton.song.addListener("is_playing", (isPlaying) => {
      wss.clients.forEach(async (client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ type: "is_playing", isPlaying }));
        }
      });
    });
    ableton.song.addListener("tempo", (tempo) => {
      wss.clients.forEach(async (client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ type: "tempo", tempo }));
        }
      });
    });
    ableton.song.addListener("loop", (isLooped) => {
      wss.clients.forEach(async (client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ type: "is_looped", isLooped }));
        }
      });
    });
    currentSongProgressEmitter.on("songProgressChanged", (songProgress) => {
      const message = JSON.stringify({
        type: "song_progress",
        songProgress: songProgress,
      });
      wss.clients.forEach(async (client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(message);
        }
      });
    });
    currentPartProgressEmitter.on("partProgressChanged", (partProgress) => {
      const message = JSON.stringify({
        type: "part_progress",
        partProgress: partProgress,
      });
      wss.clients.forEach(async (client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(message);
        }
      });
    });
    selectedPartIndexEmitter.on("selectedPartIndexChanged", (partIndex) => {
      const message = JSON.stringify({
        type: "selected_part_index",
        partIndex: partIndex,
      });
      wss.clients.forEach(async (client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(message);
        }
      });
    });
    selectedSongIndexEmitter.on("selectedSongIndexChanged", (songIndex) => {
      const message = JSON.stringify({
        type: "selected_song_index",
        songIndex: songIndex,
      });
      wss.clients.forEach(async (client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(message);
        }
      });
    });
    cueEventEmitter.on("cuesUpdated", (updatedCues) => {
      wss.clients.forEach(async (client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(
            JSON.stringify({ type: "cues_updated", cues: updatedCues })
          );
        }
      });
    });
  })
  .catch((error) => {
    console.error("Error starting Ableton client:", error);
  });

server.listen(8080, () => {
  console.log("Server listening on port 8080");
});

app.get("/cues", async (req, res) => {
  try {
    await ableton.start();
    const mergedCues = await fetchCues();
    res.setHeader("Content-Security-Policy", "script-src-attr 'self'");
    res.json(mergedCues);
  } catch (error) {
    console.error("Error in /cues endpoint:", error);
    res.status(500).json({ error: "An error occurred", details: error.message });
  }
});

app.get("/start-playing", async (req, res) => {
  try {
    await ableton.start();
    await ableton.song.startPlaying();
    res.json({ message: "Playback started" });
  } catch (error) {
    console.error("An error occurred:", error);
    res.status(500).json({ error: "Playback failed" });
  }
});

app.get("/stop-playing", async (req, res) => {
  try {
    await ableton.start();
    await ableton.song.stopPlaying();
    res.json({ message: "Playback stopped" });
  } catch (error) {
    console.error("An error occured:", error);
    res.status(500).json({ error: "Playback couldn't stop" });
  }
});

app.post("/update-cues", async (req, res) => {
  const { cues } = req.body;
  try {
    await ableton.start();
    globalMergedCues = cues;
    cueEventEmitter.emit("cuesUpdated", globalMergedCues);
    res.status(200).json({ message: "Ceeue order updated successfully" });
  } catch (error) {
    console.error("Error updating cue order:", error);
    res.status(500).json({ error: "Failed to update cue order" });
  }
});

app.post("/set-loop-area", async (req, res) => {
  const loopData = req.body;
  try {
    await ableton.start();
    await ableton.song.set("loop_start", loopData.loopStart);
    await ableton.song.set("loop_length", loopData.loopLength);
    res.status(200).json({
      message: "Loop time set up in Ableton Live",
    });
  } catch (error) {
    console.error("Error setting loop time", error);
    res.status(500).send("Error setting loop time");
  }
});

app.post("/set-selected-song-index", async (req, res) => {
  const { songIndex, partIndex } = req.body;

  try {
    // Check if songIndex is within bounds
    if (songIndex < 0 || songIndex >= globalMergedCues.length) {
      throw new Error("Invalid songIndex");
    }

    // Check if songPartsCues is defined if partIndex is not -1
    if (partIndex !== -1 && (!globalMergedCues[songIndex].songPartsCues ||
        partIndex < 0 ||
        partIndex >= globalMergedCues[songIndex].songPartsCues.length)) {
      throw new Error("Invalid partIndex or songPartsCues not defined");
    }

    await ableton.start();

    if (partIndex === -1) {
      const song = globalMergedCues[songIndex]?.song[0];
      if (!song) {
        throw new Error("No song found at the specified index");
      }
      const songCuePoint = new CuePoint(ableton, song);
      await songCuePoint.jump();
    } else {
      const part = globalMergedCues[songIndex]?.songPartsCues[partIndex];
      if (!part) {
        throw new Error("No part found at the specified index");
      }
      const partCuePoint = new CuePoint(ableton, part);
      await partCuePoint.jump();
    }

    res.status(200).json({
      message: "Cue received and processed in Ableton Live",
    });
  } catch (error) {
    console.error("Error processing cue:", error);
    res.status(500).send("Error processing cue");
  }
});

app.get("/set-is-looped", async (req, res) => {
  try {
    await ableton.start();
    const currentLoopState = await ableton.song.get("loop");
    await ableton.song.set("loop", !currentLoopState);
    res.status(200).json({
      message: "Loop set up in Ableton Live",
    });
  } catch (error) {
    console.error("Error setting loop", error);
    res.status(500).send("Error setting loop");
  }
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
