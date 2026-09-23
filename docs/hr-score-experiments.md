# Prospective HR score experiments

Registered September 22, 2026 (America/Chicago). These hypotheses are not validated predictions and do not change the displayed score.

- **no-streak-v1:** Remove the existing recent-HR-game contribution. All other weights stay unchanged. Test whether recent HR outcomes add useful ranking information.
- **contact-first-v1:** Remove the streak contribution, double the existing sample-shrunk barrel contribution, and halve season and handedness HR-rate contributions. All other weights stay unchanged. These are fixed experimental weights, not optimized weights.

The baseline executes the actual website scoring function. Baseline formula and challenger definitions are hashed into version IDs. New pregame records freeze scores, contributions, matchup inputs and data timestamps. Historical records are never retroactively assigned challenger scores.

Both experiments require confirmed lineups. Contact-first also requires at least 100 tracked batted balls, a finite barrel rate, and contact data checked within 36 hours. This is season contact evidence, not recent-window Statcast.

Evaluation requires four or more recorded candidates in a board/date cohort and identical complete candidate pools. Select the top three before examining outcomes. Wait until every candidate is hit, miss or void. Void picks leave the denominator; no replacements are chosen after results. Report baseline/challenger hits and graded counts, distinct dates, dates better/worse/tied, and cohorts where selections differ. Versions never mix.

Results live in data/hr-score-evaluation.json. This test covers the recorded published pool, not every MLB hitter. It cannot prove improvement from an early streak. Review a substantial spread of new dates, differing selections, sample uncertainty, data coverage, and stability before proposing a live formula change. No automatic promotion is enabled. No profitability or calibrated probability claim is supported; market odds are not yet evaluated.

Pitch mix, H2H and weather remain recorded context, not new score boosts. Testing those factors needs verified samples and aligned pregame inputs.
