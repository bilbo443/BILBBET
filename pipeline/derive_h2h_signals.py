"""
Derives the four H2H-betting signal files from team_market_coeffs.json,
which is what the real, live H2H match betting markets actually read from
(NOT team_market_coeffs.json directly) -- computeH2HMarket() in app.js
uses H2H_SHIFT/H2H_CUP_SHIFT/H2H_VARIANCE_WIDEN/H2H_HISTORY specifically.

This step was missing from the original v2/v3 coefficient update: futures
odds were regenerated from the new coefficients, but these four derived
files were never touched, leaving real H2H betting markets silently
running on the OLD, pre-update coefficient values for every team even
after futures had moved on -- a genuine inconsistency between two parts
of the same live app pricing the same teams differently.

Confirmed the exact derivation for each file by comparing every existing
value against the coefficient file, so this isn't a guess:
  - h2h_shift.json[team]          = scale * (eliza - 0.5 * relegation_risk)
    (identical to the 'eliza' market's own shift formula)
  - h2h_cup_shift.json[team]      = scale * fa_cup
  - h2h_variance_widen.json[team] = variance_widen (direct copy)
  - h2h_history.json              = roddy_history.json (identical file,
    confirmed byte-for-byte equal for every team checked)

sync_roster.py's own docstring confirms these four files were always
meant to be regenerated together with team_market_coeffs.json from the
same underlying rebuild -- this script is what keeps that true going
forward, so this gap doesn't reappear on the next coefficient update.

Run this any time team_market_coeffs.json or roddy_history.json changes.
"""
import json

RELEGATION_WEIGHT = 0.5


def derive_h2h_signals(coeffs_path='team_market_coeffs.json', roddy_history_path='roddy_history.json'):
    coeffs_data = json.load(open(coeffs_path))
    scale = coeffs_data['scale']
    tc = coeffs_data['team_coeffs']

    h2h_shift = {t: round(scale * (c['eliza'] - RELEGATION_WEIGHT * c['relegation_risk']), 3) for t, c in tc.items()}
    h2h_cup_shift = {t: round(scale * c['fa_cup'], 3) for t, c in tc.items()}
    h2h_variance_widen = {t: c['variance_widen'] for t, c in tc.items()}
    h2h_history = json.load(open(roddy_history_path))

    json.dump(h2h_shift, open('h2h_shift.json', 'w'))
    json.dump(h2h_cup_shift, open('h2h_cup_shift.json', 'w'))
    json.dump(h2h_variance_widen, open('h2h_variance_widen.json', 'w'))
    json.dump(h2h_history, open('h2h_history.json', 'w'))
    print(f"Wrote h2h_shift.json, h2h_cup_shift.json, h2h_variance_widen.json, h2h_history.json "
          f"({len(tc)} teams from coefficients, {len(h2h_history)} teams with score-pool history)")


if __name__ == '__main__':
    derive_h2h_signals()
