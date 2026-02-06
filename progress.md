Original prompt: 利用刚刚已经安装develop-web-game skill, 在 admin 面板右上角增加一个小游戏按钮 ,点击弹出解压 web 游戏小窗

- Added admin top-right mini game button and modal shell.
- Added modal open/close behavior in admin JS.
- Created /public/mini-game.html with a canvas bubble pop game, render_game_to_text, and advanceTime hooks.

TODO:
- Run Playwright web game client against /mini-game.html once the server is running.
- Playwright client run failed: missing Playwright package (ERR_MODULE_NOT_FOUND).
- Added game selection menu with two modes (Bubble Relief, Zen Drift) in mini-game page.
- Enlarged admin mini game modal.
