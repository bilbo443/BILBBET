"""
Layer 6: rollback.

A published (merged) odds refresh is just a git commit touching data/*.json
-- which means undoing one is exactly what git is already good at. This
script doesn't reinvent that; it wraps the two commands that actually do
the work (`git log` to find what to roll back to, `git revert` to undo it
cleanly) with the same guardrails as every other layer in this pipeline:
show what would happen before doing it, require explicit confirmation,
never guess which commit is "the bad one" without being told.
"""
import subprocess
import sys
import argparse


def run(cmd, cwd=None):
    result = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True)
    return result.returncode, result.stdout.strip(), result.stderr.strip()


def list_recent_data_commits(repo_path, data_path='data/', limit=10):
    code, out, err = run(
        ['git', 'log', f'-{limit}', '--oneline', '--', data_path], cwd=repo_path
    )
    if code != 0:
        raise RuntimeError(f"Couldn't read git history: {err}")
    return out.splitlines()


def show_diff_for_commit(repo_path, commit_hash):
    code, out, err = run(['git', 'show', '--stat', commit_hash], cwd=repo_path)
    if code != 0:
        raise RuntimeError(f"Couldn't show commit {commit_hash}: {err}")
    return out


def rollback_commit(repo_path, commit_hash, dry_run=True):
    """Reverts the given commit (creates a new commit that undoes it --
    never rewrites history, so the bad version stays visible in the log
    rather than disappearing, and this is safe to run even after other
    people have pulled the bad commit)."""
    if dry_run:
        code, out, err = run(['git', 'revert', '--no-commit', '--no-edit', commit_hash], cwd=repo_path)
        # undo the staged revert immediately -- dry run should touch nothing
        run(['git', 'revert', '--abort'], cwd=repo_path)
        if code != 0:
            return False, f"Dry run: this revert would conflict and needs manual resolution.\n{err}"
        return True, f"Dry run: commit {commit_hash} can be cleanly reverted. Re-run with --confirm to actually do it."

    code, out, err = run(['git', 'revert', '--no-edit', commit_hash], cwd=repo_path)
    if code != 0:
        run(['git', 'revert', '--abort'], cwd=repo_path)
        return False, f"Revert failed, aborted cleanly, nothing changed.\n{err}"
    return True, f"Reverted {commit_hash}. New commit created undoing it -- push this to publish the rollback."


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--repo', required=True)
    parser.add_argument('--list', action='store_true', help='List recent commits touching data/')
    parser.add_argument('--commit', help='The commit hash to roll back')
    parser.add_argument('--confirm', action='store_true', help='Actually perform the rollback (default is dry-run)')
    args = parser.parse_args()

    if args.list:
        for line in list_recent_data_commits(args.repo):
            print(line)
        sys.exit(0)

    if not args.commit:
        print("Specify --commit <hash> (see --list for recent options)")
        sys.exit(1)

    # Real gap found and fixed 2026-08-20, via directly testing an invalid
    # commit hash rather than assuming this worked: an unrecognized hash
    # used to crash with a raw Python traceback instead of a clean
    # message -- exactly the wrong experience for a tool meant to be used
    # in a stressful "something just went wrong, fix it now" moment, and
    # inconsistent with every other tool in this pipeline's "clear
    # message, not a scary traceback" standard.
    try:
        print(f"Commit {args.commit}:")
        print(show_diff_for_commit(args.repo, args.commit))
        print()
        ok, message = rollback_commit(args.repo, args.commit, dry_run=not args.confirm)
    except RuntimeError as e:
        print(f"\nError: {e}\nCheck the commit hash (see --list for recent options) and try again.")
        sys.exit(1)
    print(message)
    sys.exit(0 if ok else 1)
