# RalloPicks

Upload all files/folders in this package to the root of the GitHub repository.

Required GitHub secret:
- `ODDS_API_KEY` — your regenerated The Odds API key. Never place it in index.html or commit it.

Automatic updater:
- `.github/workflows/update-data.yml`
- Runs three times per day and can also be run manually from GitHub Actions.
- Updates `data/odds.json` and `data/arsenals.json`.

Website:
- `index.html`

After upload:
1. Add the `ODDS_API_KEY` repository secret.
2. Open Actions and run "Update RalloPicks Data" once.
3. Enable GitHub Pages from the main branch/root.
