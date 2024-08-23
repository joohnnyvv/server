## Overview

This [Node.js](https://github.com/nodejs/node) application serves as a server for managing setlists and controlling playback in Ableton Live. It provides a REST API for interacting with Ableton Live, as well as WebSocket functionality for real-time updates. This server is designed to work with the [Ableton Setlist Manager](https://github.com/joohnnyvv/ableton-setlist-manager-web) client application.

## Installation

Follow these steps to set up the server on your local machine:

1.  **Clone the Repository:**

        git clone https://github.com/joohnnyvv/setlist-mgmt-server.git

2.  **Install Dependencies:**

         npm install

3.  **Install Ableton.js MIDI Remote Script:**

* Copy the midi-script folder from the official [repo](https://github.com/leolabs/ableton-js).
* Rename the folder to AbletonJS and paste it into Ableton's MIDI Remote Scripts directory.
* The typical path is: "C:\ProgramData\Ableton\Live 12 Standard\Resources\MIDI Remote Scripts".     
* Start Ableton and add the script to your list of Control Surfaces.   

![image](https://github.com/user-attachments/assets/e89cf485-6fc8-44a3-b502-503c4415127a)

4.  **Run the Server**

         node ./src/server.js

## Ableton Setlist Creation

When creating a setlist, it's important to follow the specific Locator naming conventions for songs and their parts to ensure proper processing and playback.


- **Song Start Locator Name Format:**

  The song start Locator should begin with the actual name of the song, followed by additional information enclosed in curly braces `{}`. This additional information should include the tempo and key of the song.

  *Example:*

  ```text
  SONG_NAME {"tempo":"170BPM","key":"CMaj"}
  ```


- **Part Locator Name Format:**

  Parts within a song should begin with the > symbol, followed by the name of the part.

  *Example:*

  ```text
  >Verse 1
  ```


- **Ending Locator Name Format:**

  The end of a song or a section should be marked with an Ableton locator named \<end\>.

  *Example:*

  ```text
  SONG_NAME <end>
  ```


## Features

- Fetching and merging cue points from Ableton Live sets.
- Starting and stopping playback in Ableton Live.
- Updating cue order.
- Setting loop areas.
- Selecting songs and parts for playback.
- Toggling loop mode.

## Tech Stack

- [Node.js](https://github.com/nodejs/node): Backend server environment.
- [Express.js](https://github.com/expressjs/express): Web application framework for Node.js.
- [WebSocket](https://github.com/websockets/ws): Provides full-duplex communication channels over a single TCP connection.
- [Ableton-js](https://github.com/leolabs/ableton-js): Library for controlling Ableton Live.
- [cors](https://github.com/expressjs/cors): Middleware for enabling Cross-Origin Resource Sharing (CORS).
- [http](https://nodejs.org/api/http.html): Module for creating HTTP servers.

## API Endpoints

- `GET` /cues: Fetches cue points from Ableton Live sets.
- `GET` /start-playing: Starts playback in Ableton Live.
- `GET` /stop-playing: Stops playback in Ableton Live.
- `POST` /update-cues: Updates cue order in Ableton Live.
- `POST` /set-loop-area: Sets loop area in Ableton Live.
- `POST` /set-selected-song-index: Sets selected song or part for playback in Ableton Live.
- `GET` /set-is-looped: Toggles loop mode in Ableton Live.

## WebSocket Events

- `song_time`: Sends current song time during playback.
- `is_playing`: Sends playback status (playing or paused).
- `tempo`: Sends tempo changes.
- `is_looped`: Sends loop mode status.
- `song_progress`: Sends progress of the current song.
- `part_progress`: Sends progress of the current song part.
- `selected_part_index`: Sends index of the selected song part.
- `selected_song_index`: Sends index of the selected song.

## Designed for [Ableton Setlist Manager Client App](https://github.com/joohnnyvv/ableton-setlist-manager-web)

This server is specifically designed to work in conjunction with the [Ableton Setlist Manager](https://github.com/joohnnyvv/ableton-setlist-manager-web) client application.

## Authors

- [@joohnnyvv](https://github.com/joohnnyvv)

## License

This project is licensed under the MIT License - see the [LICENSE](https://github.com/joohnnyvv/setlist-mgmt-server/blob/main/LICENSE.md) file for details.
