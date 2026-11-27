# 学习板 / Learning Board

Junie Lau 的学习 moodboard：黑底网页，每块是一个想学的项目——上面是标志性画面，下面是标题和一段短说明。卡片可以自由摆在黑板上，拖动空白处移动视线，并缩放。位置只写在这台浏览器里，没有跨设备同步。每张卡右下角有一个已学开关：默认滑块在左边是未学，滑到右边是已学，已学的卡片会稍稍变淡；这个状态也只写在这台浏览器里。

每次内容更新发布之后，第一次打开会按原发布日期从新到旧重新排开全部卡片，包括以前在这台浏览器里保存过摆放和视角的情况。同一版里再拖动，仍留在这台浏览器。导出和导入备份还在。已经存过的标注不会被清掉，页面上也不再显示标注输入框。只给旧卡补链接不会改它的原发布日期。只有日期、没有钟点的条目，排在同一天里已经有钟点的条目之后。

维护规则：同一页上有三块板，目录在最上方。默认地址打开 Claude 学习板，`#openai` 或 `?board=openai` 打开 OpenAI 学习板，`#gsplat` 或 `?board=gsplat` 打开高斯泼溅学习板。高斯泼溅板收的是以 3D Gaussian Splatting 为主要手艺的作品和开源工具，不是某一家模型厂商的专板。每块板各自按原发布日期从新到旧排，内容卡每行八张，说明卡单独占上面一行，不占内容位。板上不足八张时，就按实际张数排在这一行，空位留空。没有脚本时，页面本身也是这个行列，不是五列，说明卡也不占格子。桌面第一次打开要把这一行放进窗口。三块板的位置和视角分开保存。官方页没有作品日期的项目，如果能找到作者在 X 的首发帖，就用首发帖时间；找不到的排在该板所有已知日期之后。OpenAI 板现在是 12 张独立创作者作品和 8 张官方 Showcase 或官方发布，其中 5 张官方 Showcase 按作者首发帖时间排，2 张没有日期。GPT-6.2 Astra 的官方型号是 gpt-6.2-astra。作者写的 Ultra 不是官方型号名。

2026-11-25 全板复核：每张卡的「依据与限度」统一写原发布时间、作者自述的方法和工具（用过的和只拿来比较的分开写）、当天重新查的公开数据和核验时间、社区反馈抽样（含批评）、推广与利益关系，以及上板判断。每张卡的 `data-audit` 是 keep、borderline、recommend-removal 或 unverifiable。建议移除的卡还在板上，等 Junie 决定。逐张记录见 `records/cycles/2026-11-25-audit.json`。本地检查：`python3 tools/check_board.py`。

2026-11-25 新一轮（`2026-11-25-round`）：按同一标准新增 7 张，Claude 4 张（procedural-rpg、cinderwatch、riemann-anime-intro、claude-blender-commercial），OpenAI 3 张（worlds-fair-reel、ai-vtuber-147、atat-threejs-blender）。没通过的候选和原因见 `AUDIT.md` 和 `records/cycles/2026-11-25-round.json`。

型号存疑规则（2026-11-25 起）：作者自称的型号还不在官方型号表里的作品，达到传播和学习门槛也可以上 Claude 板，但卡面必须有「型号存疑」徽标和一行说明（作者称的型号、官方型号表查于何时、提交里的 Co-Authored-By），标记为 `data-model-claim="unverified"`。首批 3 张：noroi-iwai、the-tea-ride、the-last-page（`records/cycles/2026-11-25-opus56.json`）。


2026-11-27 晚（`2026-11-27-gsplat-10`）：给既有「高斯泼溅」板新收 10 张，现为 12 张。Junie 点名最近大火的赛车应用，本轮认定为 WASCAPE（浏览器里驾驶真实泼溅地点的应用）；它未过 X/YouTube 工作门槛，按点名案例收录并标明限度。其余 9 张均过线。没通过的候选和原因见 `AUDIT.md` 和 `records/cycles/2026-11-27-gsplat-10.json`。Claude 仍是 39 张，OpenAI 仍是 20 张，合计 71 张。

2026-11-27（`2026-11-27-gsplat`）：新增第三块「高斯泼溅」学习板。这一版收录 2 张：Ink Studio（siliconjungle / @JungleSilicon）和 splat-walk（Will Eastcott / @willeastcott）。Junie 先看到的是 splat-walk 的小红书转述，已追到 X 原作。没通过的候选和原因见 `AUDIT.md` 和 `records/cycles/2026-11-27-gsplat.json`。Claude 仍是 39 张，OpenAI 仍是 20 张，合计 61 张。


Live: https://junielau.github.io/learning-board/

画面来自各项目的官方发布，或作者视频的官方封面，版权仍归原作者。Portals 为 CC BY-NC-SA 4.0，仅限非商业使用。The Moss Keeper 的海报取自 Chetaslua 仓库里的官方画面。splat-walk 封面取自作者原帖视频，场景是 David Fletcher 的 “Artillery Passage”，CC BY 4.0。
