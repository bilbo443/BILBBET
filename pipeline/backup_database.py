"""
Layer 6 extension: scheduled backup.

Unlike the odds refresh (which stays strictly manual, since publishing bad
data is the risk we're guarding against), a backup is read-only -- there's
no judgment call involved, nothing it could get wrong that a bad refresh
could. That's exactly the distinction that makes this safe to run on a
genuine schedule rather than needing a human to press a button every time.

Pulls the whole kv_store table as one raw, complete CSV (the actual safety
net -- if anything ever needs restoring, this has everything, verbatim,
without this script's own assumptions about the app's key scheme getting
in the way). Also derives a couple of human-readable views (bets,
balances) for convenience -- those are a bonus, not the backup itself.

Committing the output to the repo means git's own history becomes the
backup history for free: every scheduled run is a new commit, nothing
prior is ever lost, and restoring an old snapshot is just checking out an
old commit.
"""
import requests
import csv
import json
import os
from datetime import datetime, timezone


def fetch_full_kv_store(supabase_url, anon_key):
    """Raw dump of the whole table via Supabase's auto-generated REST API.
    No filtering, no reshaping -- the complete, verbatim safety net."""
    resp = requests.get(
        f"{supabase_url}/rest/v1/kv_store",
        params={"select": "*"},
        headers={"apikey": anon_key, "Authorization": f"Bearer {anon_key}"},
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()


def write_raw_backup(rows, out_path):
    with open(out_path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(['key', 'value', 'updated_at'])
        for row in rows:
            writer.writerow([row['key'], json.dumps(row['value']), row.get('updated_at', '')])


def write_readable_views(rows, out_dir, timestamp):
    users = []
    bets = []
    for row in rows:
        key, val = row['key'], row['value']
        if key.startswith('bilbbet2_user:'):
            users.append(val)
        elif key.startswith('bilbbet2_bet:'):
            bets.append(val)

    users_path = os.path.join(out_dir, f'balances-{timestamp}.csv')
    with open(users_path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(['username', 'balance', 'status', 'isAdmin'])
        for u in users:
            writer.writerow([u.get('username'), u.get('balance'), u.get('status', 'APPROVED'), u.get('isAdmin', False)])

    bets_path = os.path.join(out_dir, f'bets-{timestamp}.csv')
    with open(bets_path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(['username', 'selections', 'stake', 'combinedOdds', 'potentialReturn', 'status', 'timestamp'])
        for b in bets:
            selections = ' | '.join(s.get('label', '') for s in b.get('selections', []))
            writer.writerow([b.get('username'), selections, b.get('stake'), b.get('combinedOdds'),
                              b.get('potentialReturn'), b.get('status', 'PENDING'), b.get('timestamp')])

    return users_path, bets_path


def run_backup(supabase_url, anon_key, out_dir='backups'):
    os.makedirs(out_dir, exist_ok=True)
    timestamp = datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')

    rows = fetch_full_kv_store(supabase_url, anon_key)

    raw_path = os.path.join(out_dir, f'full-snapshot-{timestamp}.csv')
    write_raw_backup(rows, raw_path)

    users_path, bets_path = write_readable_views(rows, out_dir, timestamp)

    print(f"Backed up {len(rows)} row(s).")
    print(f"  Full snapshot: {raw_path}")
    print(f"  Balances view: {users_path}")
    print(f"  Bets view:     {bets_path}")
    return {'raw_path': raw_path, 'users_path': users_path, 'bets_path': bets_path, 'row_count': len(rows)}


if __name__ == '__main__':
    import argparse
    import sys
    parser = argparse.ArgumentParser()
    parser.add_argument('--supabase-url', required=True)
    parser.add_argument('--anon-key', required=True)
    parser.add_argument('--out-dir', default='backups')
    args = parser.parse_args()
    try:
        run_backup(args.supabase_url, args.anon_key, args.out_dir)
    except requests.exceptions.RequestException as e:
        # Consistent with rollback.py / verify_published.py's error
        # handling -- lower stakes here since this runs unattended on a
        # schedule rather than interactively, but still worth a clear
        # message in the Action logs over a raw traceback.
        print(f"Backup failed -- couldn't reach Supabase: {e}")
        sys.exit(1)
