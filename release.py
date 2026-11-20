# 公開の前に実行する。
# 1. remind-parse.js と gas/Code.gs 末尾の同期を保つ
# 2. test/*.test.js をすべて実行し、失敗したら公開を止める
# 3. index.html と version.json に同じ版の番号（日時）を書きこむ
import re, json, datetime, glob, subprocess, sys

# 1. remind-parse.js を gas/Code.gs 末尾と同期
MARKER = "/* ========== 日付の読み取り（remind-parse.js と同じもの。直すときは remind-parse.js を直して release.py で入れ直す） ========== */\n"
OLD_MARKER = "/* ========== 日付の読み取り（remind-parse.js と同じもの。直すときは remind-parse.js を直して _patch で入れ直す） ========== */\n"
rp = open("remind-parse.js", encoding="utf-8").read().rstrip("\n") + "\n"
gs_path = "gas/Code.gs"
gs = open(gs_path, encoding="utf-8").read()
pos = gs.find(MARKER)
if pos < 0:
    pos = gs.find(OLD_MARKER)
assert pos >= 0, "gas/Code.gs に remind-parse.js 同期用の目印が見つかりません"
new_gs = gs[:pos] + MARKER + rp
if new_gs != gs:
    open(gs_path, "w", encoding="utf-8", newline="\n").write(new_gs)
    print("synced remind-parse.js -> gas/Code.gs")

# 2. 全テストを実行
tests = sorted(glob.glob("test/*.test.js"))
assert tests, "テストファイルが見つかりません"
for t in tests:
    res = subprocess.run(["node", t], capture_output=True, text=True, encoding="utf-8")
    if res.returncode != 0:
        print("TEST FAILED:", t)
        print(res.stdout)
        print(res.stderr)
        sys.exit(res.returncode)
    print("test ok:", t)

# 3. 版の番号を更新
v = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")
p = "index.html"
s = open(p, encoding="utf-8").read()
s, n = re.subn(r'const VERSION = "[^"]*";', 'const VERSION = "%s";' % v, s)
assert n == 1
# 部品のスクリプト（remind-parse.js など）にも版を付け、古い部品と新しい画面が混ざらないようにする
s = re.sub(r'(<script src="[a-z-]+\.js)\?v=[^"]*"', lambda m: m.group(1) + '?v=' + v.replace(" ", "_").replace(":", "") + '"', s)
open(p, "w", encoding="utf-8", newline="\n").write(s)
open("version.json", "w", encoding="utf-8", newline="\n").write(json.dumps({"version": v}) + "\n")
print("version", v)
