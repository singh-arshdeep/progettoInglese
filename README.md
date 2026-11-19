# iPhone 17 Review Lab

Class game for the English project: our iPhone 17 presentation, a Kahoot-style quiz on linkers of manner and
recommending phrases, and a star rating of our review. The host's phone is the remote, the projector shows,
the class plays from their phones.

## Run on Render

1. New → **Web Service** → connect this repository.
2. Runtime **Node**, build command `npm install`, start command `npm start` (or use `render.yaml`).
3. Environment → add `HOST_PASSWORD` (the password the host types to create a game).

On the free plan the service sleeps after 15 minutes without visits: open the site a minute before the lesson.
Games are kept in memory, so a restart ends the game in progress.

## Run on your computer

```
set HOST_PASSWORD=yourpassword   (Windows)   or   export HOST_PASSWORD=yourpassword
npm start
```
Then open http://localhost:3000

## Files

- `server.mjs` – serves `public/` and the game API
- `api/game.mjs` – game rules (quiz, rating, presentation steps)
- `public/index.html` – home, host remote, big screen and player screens
- `public/presentation/` – our presentation (arrow keys work when opened on its own)
- `public/media/` – renders used in the quiz
