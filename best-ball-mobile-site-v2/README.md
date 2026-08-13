# Best Ball Teams

A mobile-first static web app that reads an 18-hole CSV in the browser, creates every two-player best-ball pairing, and lets the user save or share the results.

## Use locally

Serve this folder with any local web server, then open `index.html` through that server. The app is intentionally static and has no build step.

## CSV format

The app looks for a header row containing a player name column plus `Hole 1` through `Hole 18`. See `sample.csv` for an example.

## GitHub Pages

The included workflow tests the score calculations and publishes the repository to GitHub Pages whenever `main` changes. In the repository settings, set **Pages → Build and deployment → Source** to **GitHub Actions**.

The CSV is processed locally in the browser. No scores are uploaded to a server.
