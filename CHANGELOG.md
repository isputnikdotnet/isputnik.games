# Changelog

Every release, newest first. Generated from `changelog.json` by `npm run changelog` —
edit that file, not this one.

## 0.27.0 — Blitz chess, pieces you can drag, and invitations with a QR code

- **Chess on the clock.** A new game against the computer, at one screen or online can be played with a clock: 1 minute, 3 minutes with 2 seconds added after each move, 5 or 10 minutes. Each side's first move is free, then the clock runs; whoever runs out loses — or it is a draw, if the other side has nothing left to checkmate with. Online, the server keeps the time, so it is the same on both screens, and a game whose time ran out ends the moment either player looks at it. Undo is off on the clock. Before, chess had no clock at all.
- **Drag the pieces.** A piece can now be carried to its square with the mouse or a finger, as well as tapped and then tapped where it goes. The squares it may reach are marked while it is carried; let go anywhere else and it goes back.
- **A new games lobby.** Bigger game cards with a Play button across each and an invite button in the corner, a short tip on how to invite, a calmer "Your turn" strip with a mountain-and-planet picture, and arrows on the recent games. On a phone the lobby no longer spills past the edge of the screen — the leaderboard's filters pushed it wider.
- **A new invitation window.** Games as picture tiles, a searchable list of members, colours shown as swatches, and the game's own settings — the chess clock among them.
- **Invite someone outside the family with a QR code.** The External invite tab now shows the settings beside the link: once it is made, a QR code to scan from a phone across the table, the link to copy, a button that writes the invitation email for you, and how long it works — 1, 7 or 14 days. Choosing the length needs the next isputnik.home release; until then every link works for 14 days, as before.
- **Fix:** pressing the button to make a guest link without typing the guest's name did nothing at all; it now says the name is missing and puts the cursor there.

## 0.26.0 — Play with no connection, and step back through a chess game

- **The games play with no connection.** The first visit after this update stores the whole games app on the device, so the installed iSputnik app opens Games on a plane, or away from the house where the server cannot be reached. It opens as the member who last signed in there, says it is offline, and everything that needs nobody else works: games against the computer, two at one screen, Sputnik Catch, Torpedo Run and Crossmath. Before, the page needed the server just to start and showed "The games are not available".
- **Results made offline are not lost.** A finished game against the computer, a chess game kept for review and an arcade score wait on the device and are sent when the server is next reached — tried every half minute and whenever the app comes back into view. An arcade run that could not be sent used to count on that device only. Results stay with the member who made them, even if someone else signs in on the same device first.
- **What needs the server says so.** Online matches, chess puzzles, My games and game review show "This needs a connection" instead of an error, and inviting is switched off until the connection is back. A device nobody has signed in on, and a guest, still need the server.
- **Chess: step back through the game.** A row under the move list — Start, Back, Play, Forward, End — shows any earlier position of the game being played, all the way to the first move, against the computer, at one screen and online. It only looks: the game stays where it is, pieces move again once you are back at the last move, and Undo is still what takes a move back. Play runs the moves one after another and becomes Stop while it does. Game review has the same row; its Next button is now Forward.

## 0.25.4 — Also on Docker Hub

- **The image is on Docker Hub too, as isputnikdotnet/isputnik.games.** Every release tag publishes the same image to ghcr.io and to Docker Hub, as isputnik.home's does, and the Docker Hub page shows this README under a description that says what the container is: an add-on for isputnik.home. The Unraid template and the compose file keep pulling from ghcr.io.

## 0.25.3 — The 0.25.2 image, built this time

- **The 0.25.2 image never reached the registry.** Its build failed on a test of the Torpedo Run page that played a run from a random seed; with some seeds the scripted shots earned a bonus round, and the card then waited for it to be fired in before the run was over and reported, so the test saw no report. The test now plays a fixed seed. This release carries everything 0.25.2 announced.

## 0.25.2 — Named as an add-on, with a change log for Unraid

- **Every public description now says what this is: an add-on for isputnik.home.** The GitHub repository, the image on ghcr.io, the Unraid Community Applications template and its profile all say the container is installed beside the isputnik container and reached only through it, so nobody installs it expecting a game server of its own.
- **The Unraid template carries its change log.** Community Applications shows when the container was last updated and what changed, from a `Date` and `Changes` block in `isputnik-games.xml` that `npm run changelog` regenerates from `changelog.json` on every release, as isputnik.home's does.

## 0.25.1 — Unraid Community Applications listing

- **Ready for Unraid Community Applications as isputnik-games.** The template now publishes port 4200 on the ordinary bridge network, so isputnik.home reaches the games at the server's own address with nothing to create first; a shared Docker network or br0 with a fixed IP work as before. It names the games as they stand and sends the administrator to isputnik.home's Control panel → Settings → Apps for the pairing, where the secret is generated first and pasted into the one setting this container has, Gateway Secret.
- **The 0.25.0 image was never published.** Its build failed on a type error in a web test, and the image registry kept 0.24.1 as the latest for three days. This release carries everything 0.25.0 announced.

## 0.25.0 — The home app's frame on phones

- **The games wear the home app's frame.** Stories and Tags join the top bar, phones get home's four tabs and sheets with no top bar, and installing the games page as an app installs iSputnik itself.

## 0.24.1 — Clearer Torpedo Run aiming and balanced encounters

- **Torpedo Run aims more clearly.** The trajectory is drawn as you aim, the horizon is split into distance bands, ships announce their arrival with a countdown, and encounters are balanced so a run is neither a walkover nor a wall.

## 0.24.0 — The games on the TV

- **Chess, Checkers, Sputnik Catch and Torpedo Run play on the TV** with a remote, in the iSputnik TV app 0.8. This server answers the TV's positions: a stateless play endpoint for a game against the computer or two on the sofa, and the legal moves of an online match. Nothing changes in the browser.
