# Best Ball Pairing Scorecards

A responsive, mobile-first static web app that reads an 18-hole CSV in the browser and creates every two-player best-ball pairing.

## Individual sharing

Each player has a **Share player** button. It creates a dedicated `share.html` link showing only that player's pairings. Hole-by-hole verification is collapsed until the recipient chooses to open it. Scores are encoded in the link and are not saved in browser storage, so the main upload page starts clean on the next visit.

## CSV format

The app looks for a header row containing a player name column plus `Hole 1` through `Hole 18`. See `sample.csv` for an example.

## GitHub Pages

The included workflow tests the calculations and publishes the repository whenever `main` changes. In the repository settings, set **Pages → Build and deployment → Source** to **GitHub Actions**.

The CSV is processed locally in the browser. No scores are uploaded to a server.
