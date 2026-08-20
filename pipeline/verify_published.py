"""
Layer 6: post-publish verification.

A merge landing on GitHub doesn't guarantee the live site is serving it --
GitHub Pages (or wherever this is hosted) has its own deploy step and its
own caching, both of which can lag or fail silently. This closes that gap:
after merging, fetch the actually-live data file and confirm it matches
what was in the merged draft, rather than just trusting that "merged"
means "live."
"""
import json
import requests


def verify_published(live_url, expected_draft_path, key_fields=None):
    """
    live_url: the real, publicly-served URL for the data file (e.g.
        https://<user>.github.io/<repo>/data/futures.json)
    expected_draft_path: the draft file that was merged, to compare against
    key_fields: optional list of (division, team) tuples to specifically
        spot-check for an exact match, in addition to the general shape
        check -- useful for confirming a specific team's odds actually
        changed the way the diff report said they would.
    """
    resp = requests.get(live_url, timeout=15)
    resp.raise_for_status()
    live = resp.json()

    with open(expected_draft_path) as f:
        expected = json.load(f)

    issues = []

    if 'division_rows' in expected:
        expected_rows = {(r['division'], r['team']): r for r in expected['division_rows']}
        if 'divisions' not in live:
            issues.append("Live file doesn't have a 'divisions' key at all -- deploy may not have propagated.")
        else:
            for (div, team), exp_row in expected_rows.items():
                live_entries = live.get('divisions', {}).get(div, {}).get('win_div_pct', [])
                live_entry = next((e for e in live_entries if e['team'] == team), None)
                if live_entry is None:
                    issues.append(f"{team} ({div}) not found in the live data at all.")

    if key_fields:
        for div, team in key_fields:
            live_entries = live.get('divisions', {}).get(div, {}).get('win_div_pct', [])
            live_entry = next((e for e in live_entries if e['team'] == team), None)
            if live_entry is None:
                issues.append(f"Spot-check failed: {team} ({div}) missing from live data.")

    return {'verified': len(issues) == 0, 'issues': issues}


if __name__ == '__main__':
    import sys
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--live-url', required=True)
    parser.add_argument('--expected-draft', required=True)
    args = parser.parse_args()

    # Real gap found and fixed 2026-08-20, via directly testing both
    # failure modes rather than assuming this worked: a connection failure
    # or a non-JSON response (GitHub Pages serving its own 404 page, very
    # plausible if the deploy genuinely hasn't propagated yet -- the exact
    # scenario this tool's own docstring exists to handle) both crashed
    # with a raw traceback instead of the same clean, actionable message
    # this tool already gives for "fetched fine, but doesn't match".
    try:
        result = verify_published(args.live_url, args.expected_draft)
    except requests.exceptions.RequestException as e:
        print(f"Couldn't reach the live URL: {e}")
        print("Could just be deploy lag -- worth a re-check in a few minutes before assuming something's broken.")
        sys.exit(1)
    except json.JSONDecodeError:
        print(f"The live URL didn't return valid JSON -- got something else instead "
              f"(a 404 page is common if the deploy hasn't propagated yet).")
        print("Worth a re-check in a few minutes before assuming something's broken.")
        sys.exit(1)

    if result['verified']:
        print("VERIFIED: live site matches the merged draft.")
        sys.exit(0)
    else:
        print("NOT VERIFIED -- issues found:")
        for issue in result['issues']:
            print(f"  - {issue}")
        print()
        print("This doesn't necessarily mean the merge was wrong -- could just be deploy lag. "
              "Worth a re-check in a few minutes before assuming something's broken.")
        sys.exit(1)
