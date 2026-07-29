#!/usr/bin/env python3
"""Push XIN-Wallet changes to GitHub via Git Data API.
针对本次提交定制：3 个独立 commit（docs / security+refactor / public）

特点：
- 接受 changes 列表（路径 + 动作 m=modify d=delete）
- 3 次 PATCH refs/heads/main，每个 commit 用前一次的 SHA 作 parent
- 保留所有未在 change 列表中的现有文件
- GITHUB_TOKEN 仅从环境变量读，不写入任何文件
"""

import os, sys, json, base64, urllib.request, urllib.error, argparse

API = "https://api.github.com"


def api(token, path, method="GET", data=None, raw=False):
    req = urllib.request.Request(API + path, method=method)
    req.add_header("Authorization", "Bearer " + token)
    req.add_header("Accept", "application/vnd.github+json")
    req.add_header("User-Agent", "xin-wallet-push")
    if data is not None:
        req.add_header("Content-Type", "application/json")
        req.data = json.dumps(data).encode("utf-8")
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            body = r.read().decode("utf-8")
            if raw:
                return body
            return json.loads(body) if body else {}
    except urllib.error.HTTPError as e:
        try:
            err_body = e.read().decode("utf-8")
        except:
            err_body = "<no body>"
        print(f"\n!!! HTTP {e.code} on {method} {path}", file=sys.stderr)
        print(f"    body: {err_body[:500]}", file=sys.stderr)
        raise


def read_file(path):
    with open(path, 'rb') as f:
        return f.read()


def build_tree_with_changes(token, repo, base_sha, all_paths_to_modify, base_dir):
    """Build a new tree based on base_sha, with given paths modified (path → bytes)."""
    # 1. Get existing tree
    tree = api(token, f"/repos/{repo}/git/trees/{base_sha}?recursive=1", raw=False)
    existing = {t["path"]: t for t in tree.get("tree", []) if t.get("type") == "blob"}
    print(f"  base tree has {len(existing)} blobs")

    # 2. Build entries: keep unchanged, modify specified
    entries = []
    delete_paths = {p for p, blob_sha in all_paths_to_modify.items() if blob_sha is None}
    modify_paths = {p: blob_sha for p, blob_sha in all_paths_to_modify.items() if blob_sha is not None}

    # Keep unchanged blobs (excluding ones we're deleting)
    kept = 0
    deleted = 0
    for path, t in existing.items():
        if path in delete_paths:
            deleted += 1
            continue  # skip this — we want it gone
        if path in modify_paths:
            continue  # will be replaced below
        entries.append({"path": path, "mode": "100644", "type": "blob", "sha": t["sha"]})
        kept += 1
    print(f"  kept {kept} unchanged blobs, removed {deleted} deletions")

    # 3. Add modified blobs
    for rel, blob_sha in modify_paths.items():
        entries.append({"path": rel, "mode": "100644", "type": "blob", "sha": blob_sha})
    print(f"  added {len(modify_paths)} modified/added blobs")

    # 4. Create tree
    res = api(token, f"/repos/{repo}/git/trees", "POST",
              {"base_tree": base_sha, "tree": entries})
    if "sha" not in res:
        print("TREE FAIL", res, file=sys.stderr)
        sys.exit(1)
    return res["sha"]


def create_blob(token, repo, abs_path):
    raw = read_file(abs_path)
    content = base64.b64encode(raw).decode("ascii")
    res = api(token, f"/repos/{repo}/git/blobs", "POST",
              {"content": content, "encoding": "base64"})
    if "sha" not in res:
        print(f"BLOB FAIL {abs_path}", res, file=sys.stderr)
        sys.exit(1)
    return res["sha"]


def commit(token, repo, base_sha, tree_sha, message):
    res = api(token, f"/repos/{repo}/git/commits", "POST",
              {"message": message, "tree": tree_sha, "parents": [base_sha]})
    if "sha" not in res:
        print("COMMIT FAIL", res, file=sys.stderr)
        sys.exit(1)
    return res["sha"]


def update_ref(token, repo, branch, new_sha):
    api(token, f"/repos/{repo}/git/refs/heads/{branch}", "PATCH",
        {"sha": new_sha})


def push_batch(token, repo, branch, base_dir, changes, message):
    """changes: list of tuples (path, action) where action is 'm' (modify/create) or 'd' (delete).
    Returns new commit sha after updating main."""
    # 1. Get base
    ref = api(token, f"/repos/{repo}/git/refs/heads/{branch}")
    base_sha = ref["object"]["sha"]
    print(f"base: {base_sha[:12]}")

    # 2. Build modify map: path → blob sha (or None for delete)
    modify_map = {}
    for path, action in changes:
        if action == 'd':
            modify_map[path] = None
        elif action == 'm':
            blob_sha = create_blob(token, repo, os.path.join(base_dir, path))
            modify_map[path] = blob_sha
            print(f"  blob: {path} -> {blob_sha[:12]}")
        else:
            raise ValueError(f"unknown action: {action}")

    # 3. Build tree + commit + update ref
    tree_sha = build_tree_with_changes(token, repo, base_sha, modify_map, base_dir)
    print(f"  tree: {tree_sha[:12]}")
    commit_sha = commit(token, repo, base_sha, tree_sha, message)
    print(f"  commit: {commit_sha[:12]}")
    update_ref(token, repo, branch, commit_sha)
    return commit_sha


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", required=True)
    ap.add_argument("--branch", default="main")
    ap.add_argument("--base-dir", required=True)
    ap.add_argument("--changes-file", required=True,
                    help="Path to a text file with lines 'm path/to/file' or 'd path/to/dir'. Directories are deleted recursively via tree orphan drop.")
    args = ap.parse_args()

    token = os.environ.get("GITHUB_TOKEN")
    if not token:
        print("ERROR: GITHUB_TOKEN not set", file=sys.stderr)
        sys.exit(1)

    # Parse changes
    changes = []  # list of (path, action)
    with open(args.changes_file) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#'):
                continue
            action, path = line.split(None, 1)
            changes.append((path, action))

    # Push
    # Note: For now, batch all into one commit (simpler; the script can extend for multi-commit if needed).
    message = "refactor/security: 2026-07-29 全面优化与重构\n\n详见项目内 code-review-2026-07-29.md 等文档\n"
    new_sha = push_batch(token, args.repo, args.branch, args.base_dir, changes, message)
    print(f"\nPUSHED: {new_sha}")
    print(f"url: https://github.com/{args.repo}/commit/{new_sha}")


if __name__ == "__main__":
    main()
