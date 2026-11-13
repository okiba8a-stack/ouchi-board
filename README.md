# おうちボード

iPad を壁掛けにして使う、自分用の家のボード。時計・天気・Googleカレンダーの予定・ルーティンのチェック・ニュースを1画面に表示し、「1週間後にパンチェッタのラップを外す」のように書くと Google カレンダーに通知つきで登録する。

- 画面：`index.html`（GitHub Pages）
- 裏方：`gas/Code.gs`（Google Apps Script、本人のアカウントで動く）
- 設定の仕方：[docs/設定手順.md](docs/設定手順.md)
- 試し表示：`index.html?demo=1`
- 日付読み取りのテスト：`node test/remind-parse.test.js`
