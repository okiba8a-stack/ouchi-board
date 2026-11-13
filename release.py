# 公開の前に実行する。index.html と version.json に同じ版の番号（日時）を書きこむ。
# 開いたままのボードは version.json を見て、番号が変わっていたら自分で読み込み直す。
import re, json, datetime
v = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")
p = "index.html"; s = open(p, encoding="utf-8").read()
s, n = re.subn(r'const VERSION = "[^"]*";', 'const VERSION = "%s";' % v, s)
assert n == 1
open(p, "w", encoding="utf-8", newline="\n").write(s)
open("version.json", "w", encoding="utf-8", newline="\n").write(json.dumps({"version": v}) + "\n")
print("version", v)
