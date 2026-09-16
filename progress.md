## 2026-09-16 - Task: 移动端适配——双摇杆、可点的 HUD，以及两处层叠冲突

### 起因

手机上根本没法玩：操作是 WASD + 鼠标瞄准 + Esc/B/Q/E 等按键，触屏一个都没有；面板按桌面列数排版，窄屏会挤爆；页面可以被手指拖动和双击缩放。移动端此前是明确的非目标，现在不是了。

### What was done

**输入**

- `src/input/stick.ts`（新）——纯函数：死区、钳制、旋钮位置、瞄准优先级。单独拆出来是因为这几条规则很容易在 pointer handler 里被就地重推一遍，而且没有触屏也能测。
- `src/input/touch.ts`（新）——两个**浮动**摇杆（手指落在哪里摇杆就在哪里生成，固定虚拟盘需要低头找，而这个游戏不给你低头的机会）。屏幕左右各半：左移动、右瞄准。用 Pointer Events 而不是 Touch Events，触屏笔记本和手写笔一并覆盖；鼠标指针忽略。
- **瞄准优先级**：右摇杆 > 移动方向 > 上一次方向 > 固定方向。武器是自动开火的，所以「没有方向」不能是零向量，否则就是对着地板突突。单手也能玩——枪口跟着走位走。
- `DomInput` 同时接键鼠和触摸，**不是启动时二选一**：触屏笔记本、带键盘的平板、中途递给别人的手机都不用去检测「这是什么设备」。

**HUD / 面板**

- 道具槽和技能槽带上 `data-use`，点击走 `Game.fire(key)`——**和键盘同一条路径**，触屏玩家不可能碰到键盘够不着的东西，反之亦然。
- 新增暂停按钮（Esc 在手机上不存在）。
- 安全区内边距（刘海、底部横条）折进各元素自己的定位规则。
- ≤640px：面板单列、可滚动、按钮最小 44px 高；触摸时道具栏抬高到摇杆之上、槽位放大到 60px、左下两块面板缩窄让出拇指区。
- 触摸时隐藏键盘提示（`Press 1`、`[B]`、槽位角标）——对着没有键盘的人写按键名，比不写更糟。
- `index.html`：`viewport-fit=cover` + `user-scalable=no`，`touch-action:none` + `overscroll-behavior:none`（拖摇杆必须是操作，不能是滚页面或下拉刷新）。

### 两处层叠冲突（都是实测截图发现的，读代码看不出来）

1. **安全区规则写在了媒体查询后面**，于是 `#ui-economy{top:calc(18px + inset)}` 盖掉了 900px 断点里的 `top:64px`，手机上顶部任务条和金币条直接叠在一起。修法不是加 `!important`，而是把 inset **折进原本就拥有这些属性的那条规则**，媒体查询里也照做——覆盖式补丁天然会和断点打架。
2. **教程提示用内联 `style.display = 'block'`**，内联样式压过媒体查询里的 `#ui-tutorial{display:none}`，于是它一直盖在血条上。改成 `hidden` 属性，布局交还给 CSS。

### Testing

- `npx eslint .`、两个 TS 工程、`npm run i18n:audit`、`npm run build`：各自单独执行，退出码均为 0。
- `npm test`：281 个测试（新增 12 条摇杆数学）。其中一条**测出了真 bug**：`resolveAim` 文档写「总是返回单位向量」，但右摇杆那条分支直接透传入参，没有归一化。生产路径上 `stickVector` 恰好保证了单位长度，所以看不出来——但函数既然承诺了，就该由它自己保证。已补。
- **真触摸实测**（Playwright + CDP `Input.dispatchTouchEvent`，Pixel 5 视口）：左半拖拽→角色位移 198px、速度方向与拖拽一致、摇杆显示、松手速度归零且摇杆消失；右半拖拽→瞄准向量 (-0.41,-0.91)，和拖拽方向 (-40,-90) 归一化后完全吻合；暂停按钮生效。零报错。
- 六块面板逐个在 393px 下截图检查：标题、天赋、设置、升级、商店、结算——**无横向溢出，无需滚动即可完整显示**。
- **桌面回归**：键盘移动 206px、鼠标瞄准正确、Esc 仍可暂停，且触摸层完全惰性（无 `touch-play` class、摇杆隐藏、暂停按钮和键盘提示都不出现）。触摸是叠加的，不是模式切换。

### Notes

- 新增 `src/input/stick.ts`、`src/input/touch.ts`、`tests/stick.test.ts`；改动 `src/input/provider.ts`、`src/ui/ui.ts`、`src/game.ts`、`index.html`。
- `Game.fire(key)` 把原先分开的道具键和技能键处理合并成一条路径，点击和按键共用。
- 打开任意面板时 `touch.release()`——否则玩家会在商店里继续往尸群里走。
- 回滚方式：回退本任务对应提交。

## 2026-09-16 - Task: 资源路径写死在域名根目录，游戏没法部署到子路径

### 起因

被问「在线试玩的网址是什么」——**这个项目从来没部署过**：没有 Pages workflow、没有 gh-pages 分支、`homepage` 指向 README。准备打包的时候发现一个真问题。

### 问题

8 处资源路径是绝对路径 `/assets/...`：

- `src/render/assets.ts` 的 `load(base = '/assets')`（精灵图 manifest + 所有 PNG）
- `src/audio/audio.ts` 的 `loadSamples(base = '/assets')`（7 个 wav）
- `src/ui/ui.ts` 里 5 处 `<img src="/assets/...">`（道具栏图标、技能图标、干员立绘、升级卡精灵、商店图标）

只要不是部署在域名根目录，这些全部 404。GitHub Pages 的 `user.github.io/<repo>/` 正是这种情况。

**而且它是静默失败的**：两个 loader 都刻意吞掉异常（「没资源就退化成程序化色块」是设计好的降级路径），所以表现不是报错，而是**整个游戏变成彩色圆圈、没有音效**，控制台一句话都没有。这个降级设计本身是对的——它让美术可以增量替换——但也正因如此，路径错了没人会发现。

### What was done

- 新增 `src/assetPath.ts`：`ASSET_BASE = \`${import.meta.env.BASE_URL}assets\``。Vite 用构建时的 `--base` 填 `BASE_URL`，所以资源路径跟着部署位置走。
- 8 处全部改用它。

### Testing

- `npx eslint .`、两个 TS 工程、`npm run i18n:audit`、`npm run build`：各自单独执行，退出码均为 0。
- `npm test`：269 个测试全过。
- 构建产物里已无绝对 `/assets`（`grep -c '"/assets' dist/assets/*.js` 三个 chunk 全是 0），`ASSET_BASE` 编译成 `"./assets"`。
- **关键一步是真的放到子路径上跑**：`vite build --base=./` 之后把 dist 放到 `http://localhost:5211/play/zombie/`，Playwright 实测——地面贴图、敌人精灵、血迹、HUD 图标全部正常加载，HTML `<img>` 零破图，**零 4xx，零 console 报错**。修之前这个场景下会静默退化成色块。

### 教训

**刻意的静默降级会掩盖配置错误。** 「资源加载失败就退化」是个好设计，但它同时意味着「路径写错」和「还没放美术」在表现上完全一样。这类降级路径至少要能被一次真实的子路径部署测出来——而在此之前，这个项目只在 `vite dev`（根路径）和 `vite preview`（根路径）下跑过，所以八个绝对路径一直没暴露。

### Notes

- 新增 `src/assetPath.ts`；改动 `src/render/assets.ts`、`src/audio/audio.ts`、`src/ui/ui.ts`。
- 仓库仍然没有部署流程。这次只是让部署**成为可能**，`npm run build -- --base=./` 产出的 dist 现在可以直接扔到任何静态托管的任何路径下。
- 回滚方式：回退本任务对应提交。

## 2026-09-16 - Task: 盾卫护盾弧——常数和注释差了 47°

### 起因

订阅 PR #5 之后翻出一条三天前的未解决评审意见（`chatgpt-codex-connector`，P2）：`WARDEN_ARC_COS = -0.28` 和它上面那句「≈ 100° total」对不上。**它是对的。**

`damageEnemy` 里的判定是 `travelDir · facing < WARDEN_ARC_COS`。子弹是**射进**盾卫的，所以正面来袭时点积接近 -1。`acos(-0.28) = 106.3°`，取反之后是「攻击者在正面 73.7° 以内被挡」——**总弧 147.5°**，不是 100°。盾卫比设计意图硬得多，绕后比 PR 描述承诺的难得多。

**为什么三天没被发现**：原有三条 warden 测试只打正对和正背后，这两个方向在 0°–180° 之间**任何**弧宽下都通过。边界一次都没测。

### What was done

- 魔法常数改成推导值：`WARDEN_ARC_DEGREES = 100` 是唯一真相，`WARDEN_ARC_COS` 由它算出来。注释和实现从结构上不可能再分叉。符号那一步（为什么是负余弦、为什么「被挡」是比较的小于侧）写进注释了——这正是当初弄错的地方。
- 新增 3 条边界测试：贴着弧边内外各 2° 打、0°–180° 每 5° 扫一遍、以及断言常数确实等于由角度推导的值。
- **种回原来的 `-0.28` 验证过这三条会挂**（三条全红，恢复后全绿），而原有的三条一条都没红——这就是这个 bug 能活三天的原因。

### 用哪个角度：先量，不猜

改成 100° 是实打实的平衡改动，而这局数值是在 147.5° 下测出来的。这个 session 里已经三次栽在「没测就调数值」上，所以这次先跑对照（ranger，n=28，300s，greedy）：

| 弧宽 | 胜率 | 中位存活 | 中位击杀 | 盾卫致死 |
|---|---|---|---|---|
| 147.5°（原） | 13/28 (46%) | 4:31 | 4127 | 0 / 9 |
| 100°（文档） | 12/28 (43%) | 4:22 | 3855 | 1 / 9 |

**z = 0.27**，差一局，纯噪声。更有说服力的是**符号是反的**：盾变窄意味着盾卫变弱，胜率不可能因此下降——这个方向本身就证明它是噪声而不是信号。两组加起来盾卫只贡献 1 次致死，它是压迫型敌人，本来就不靠杀人。

所以 147° 不是数值依赖的东西，取设计意图的 100°，代码、注释、PR 描述三者终于一致。

### Testing

- `npx eslint .`、两个 TS 工程的 `tsc --noEmit`、`npm run i18n:audit`、`npm run build`：各自单独执行，退出码均为 0。
- `npm test`：40 个文件 269 个测试（新增 3 个）。
- 两次 n=28 的无头对照跑，报告在 `/tmp` 不入库，数字见上表。

### 教训

**测试打极值不算测了边界。** 正对挡、背后不挡，这两条在任何弧宽下都成立，所以它们对「弧有多宽」这个唯一需要验证的性质一无所知。任何「角度 / 阈值 / 范围」类的常数，测试必须打在边界两侧，否则常数和它的注释迟早分叉而没人知道。

配套的结构性做法是**别让魔法数字和它的文档并列存在**：把有语义的那个量（这里是角度）设成唯一真相，另一个推导出来。

### Notes

- `src/data/enemies.ts`（+`WARDEN_ARC_DEGREES`，`WARDEN_ARC_COS` 改推导）、`tests/pressureEnemies.test.ts`（+3 条边界测试）。
- 回滚方式：回退本任务对应提交。

## 2026-09-15 - Task: 分层 BGM——四条程序化音轨，跟着战况走

### What was done

之前根本没有音乐：只有 7 个 SFX 采样，加一条 55Hz 锯齿底噪，音量跟着屏幕上的敌人数走。

- **`src/audio/music.ts`（新）——纯逻辑，和 Web Audio 完全分开。** `layerMix(state)` 是纯函数：给它 `{ pressure, surge, boss }`，返回四条音轨各自的目标增益。节奏型、Boss riff、音高换算、确定性噪声填充也都在这里。这样拆的两个理由：一是 Node 里没有 Web Audio（无头模拟跑在那儿），纯函数才能测；二是「现在该响什么」和「怎么让锯齿波发出那个声音」是两个问题。
- **四条音轨**：`bed`（一直在的低频底噪）/ `pulse`（十六分音符的底鼓 + 高通噪声 hi-hat，跟尸群压力走）/ `dread`（小二度拍频 + 颤音，血月专属，故意难听）/ `boss`（小调五声 riff，Boss 存活时）。全部交叉淡入淡出（τ=1.1s），不硬切。
- **没有音乐素材文件**，全程序化生成。零下载体积，而且能连续跟着战况走——循环音轨做不到这件事，只能在片段之间硬切。
- 音符时间来自音频时钟，`setInterval` 只负责给一个 0.28 秒的队列续杯（Web Audio 的标准 lookahead 调度），所以掉帧不会让节奏抖。标签页切走太久会重新对时，而不是一口气补放一串音符。
- 设置里加了独立的**音乐音量**滑杆——想要音效不想要音乐是很常见的偏好。
- 上一轮把 `src/audio/**` 从 eslint 确定性豁免列表里拿掉了，所以这里不能用 `Math.random`。噪声缓冲改成本地 LCG 填充——**规则逼出来的设计反而更好**：噪声每次启动都一样。

### Testing

- `npx eslint .`、两个 TS 工程、`npm run i18n:audit`、`npm run build`：各自单独执行，退出码均为 0。
- `npm test`：38 个文件 266 个测试（新增 13 个）。覆盖：任意输入（含 NaN / Infinity / 负数压力）下四条增益都在 [0,1]；安静时只有 bed；`pulse` 随压力单调上升；血月即使屏幕空也有驱动力；Boss 时 bed 被压低但不会消失；节奏型互不重叠且正好一小节；`midiToFreq` 对准 A440；噪声确定性；**以及没有 Web Audio 时 `AudioBus` 全程静默不抛异常**——无头模拟依赖这一条。
- **浏览器实测是拿 AnalyserNode 接在 master 上量真实输出**，不是看我自己设的增益值。这一步抓到了一个真 bug：颤音振荡器原本是直接 sum 进 `dread` 的 mix gain 的，而 AudioParam 上的振荡是**叠加**在 `setTargetAtTime` 目标值之上的——于是这条音轨在「增益为 0」时依然在响（实测 stopped 状态 peak 0.343，和播放时一样）。改成颤音调制它自己的节点后，stopped 的 peak 降到 0.0011。**只看代码看不出这个问题。**
- 量到的分层（peak / 频段能量）：安静 0.033、尸群 0.081、血月 0.095（高频 +70dB，颤音上来了）、Boss 中频 +13dB。暂停后 4 秒淡到 0.002，音乐音量拉到 0 是精确的 0。
- 又单独验了一遍**由游戏自己驱动**（不是手动调 `setMusic`）：开局只有 bed；时间跳到血月 + Boss 后四条全开；按 Esc 暂停全部淡出。

### 顺带修掉的一个崩溃

上面那次插桩运行里 console 报了 `The radius provided (-1.63425e-13) is negative`。定位在 `drawTelegraphs`：`k = 1 - left / tg.total`，而 `left` 是两个累加浮点数的差，可能比 `total` 大出一个 ulp，于是 k ≈ -2e-16，`tg.r * k` 成了负半径，canvas 直接在渲染循环里抛异常。已加钳制。这是个真实可达的 bug（不是时间跳跃才有的），而且**只有插桩跑起来才会看见**。

### Notes

- 新增：`src/audio/music.ts`、`tests/music.test.ts`。改动：`src/audio/audio.ts`（`setIntensity` → `setMusic`）、`src/game.ts`（`musicState()`，并在死亡 / 胜利 / 暂停 / 标题页停掉音乐）、`src/settings.ts` + `src/ui/ui.ts`（音乐音量）、`src/render/worldRenderer.ts`（上面那个钳制）、两个 README。
- `LAYER_TRIM` 单独一张表：`music.ts` 给的是「什么时候响」的音乐意图（0..1），响度配平放在音频层，调音量不用去动那个纯函数。
- 回滚方式：回退本任务对应提交。

## 2026-09-15 - Task: 英文 UI——329 处硬编码中文，外加一条不让它退回去的审计

### 架构选择（先说为什么不是 key 表）

常规做法是 key 表（`t('hud.threat.high')`）。这个项目不合适，理由有两条：

1. **key 表的失效模式是运行时的**。少写一条 key，代码照常编译、照常上线，只在没人读的那种语言下露出来。而这套数据表里「名字 + 描述」有 146 条，漏一条太容易。
2. **key 会把数据表读废**。`name: 'weapon.pistol.name'` 之后，`src/data/weapons.ts` 就不再是一张能一眼看懂的数值表了，而它现在是。

所以用的是**成对写法**：`tr('威胁：高', 'Threat: High')`。没有 key 命名空间（少一样要同步的东西），两种语言就在调用点上，**编译器保证两半都在**，中文留在数据表里该在的位置，而且可以直接 grep。

代价只有一条：数据表在模块作用域就调用了 `tr()`，所以语言必须在游戏模块被 import **之前**定好。`src/main.ts` 因此先读存档、`setLanguage()`、再动态 import 游戏；换语言 = 重载页面。对一个游戏来说这很正常，而且它换来了**其余每一个调用点都不需要订阅、不需要重渲染管线**。（`main.ts` 用的是 async 函数而不是顶层 await——构建目标比顶层 await 早，这一点是 `npm run build` 抓出来的，dev 服务器完全正常。）

函数名从 `t` 改成了 `tr`：这个代码库里有七个文件把 Transform 的局部变量叫 `t`，`t` 是个必然打架的名字。

### What was done

- `src/i18n.ts`（新）：`tr(zh, en)`、`setLanguage` / `lang`、`isLang`、`LANGUAGES`、`LANGUAGE_NAMES`（各语言用自己的语言写，这是唯一一类**不该**被翻译的字符串）、`detectLanguage()`（没选过时按 `navigator.language` 走，非英语环境留在中文）。
- `Settings` 新增 `language`，和其它设置一样是 `.catch()` 兜底——存档被改坏只损失一个选项，不是整份档案。设置面板加了语言下拉，切换即写盘 + 重载。`<html lang>` 同步跟着走。
- **329 处字符串全部改成 `tr(zh, en)`**，覆盖 29 个文件：10 张数据表（武器 / 敌人 / 被动 / 装备 / 天赋 / 干员 / 成就 / 技能 / 僚机 / 精英）、全部系统层的飘字与死因、`progression.ts` 的升级卡、`hudData.ts` 的 HUD 快照、`ui.ts` 的九块面板。
- **`tools/i18nAudit.ts`（新）+ `npm run i18n:audit` + CI 步骤** —— 这才是这一项的重点。一次性翻译好做，靠自觉维持不住。审计做两件事：
  1. `src/**` 里任何中文字符串字面量都必须在 `tr(...)` 调用内；注释豁免（注释是写给读代码的人的）。
  2. **每个 `tr()` 的英文半边不能含中文**——只是把字符串包起来不算翻译。
  为此它要会剥注释、剥模板字符串的 `${...}` 插值（`` `<h1>${tr('设置','Settings')}</h1>` `` 是合法的）、并容忍 `tr()` 嵌套。真正不该翻译的字符串可以在起始行的注释里写 `i18n-exempt`（目前只有 `LANGUAGE_NAMES` 用到）。

### Testing

- `npx eslint .`、两个 TS 工程的 `tsc --noEmit`、`npm run i18n:audit`、`npm run build`：各自单独执行，退出码均为 0。
- `npm test`：38 个文件 253 个测试（`tests/i18n.test.ts` 新增 6 个，含「language 被写成 `'klingon'` 时兜底而不是整份设置失效」）。
- **审计的两条规则都种了违例验证会报错**（和上一轮 eslint 自定义规则一样的做法）：把 `name: tr('疾冲','Dash')` 改成 `tr('疾冲','疾冲')` → 报 “English half still contains Chinese”；把另一条拆掉 `tr` → 报未包裹。两条都命中，恢复后重新变绿。
- 浏览器实测，中英各跑一遍：标题页、天赋页、设置页、成就页、商店、升级三选一、结算页，逐屏截图 + 提取文本核对；HUD（阶段 / 威胁 / 金币 / 武器槽 / 主武器 / 商店按钮）两种语言都正确。console 零报错。
- **生产构建单独实测**：这次 dev 和 prod 的模块图不一样（动态 import 把 bundle 拆成了三个 chunk），所以 `vite preview` 上又跑了一遍中英双语——`<html lang>`、标题、按钮、开局后的 HUD 全部正确。

### Notes

- 新增：`src/i18n.ts`、`tools/i18nAudit.ts`、`tests/i18n.test.ts`。改动：`src/main.ts`（改成 async bootstrap）、`src/settings.ts`、29 个含文案的源文件、`package.json`、CI、两个 README。
- 翻译过程中顺手修掉一处英文排版问题（天赋页 `win or lose.Held 400` 缺空格），是看截图发现的。
- 回滚方式：回退本任务对应提交。

## 2026-09-15 - Task: 色盲可读性——精英词缀不能只靠颜色

### 问题

三个精英词缀的区分**只有颜色**：迅捷 `#ffd166`（黄）、巨力 `#ff5252`（红）、剧毒 `#7be23a`（绿）。名牌超过 340px 就不画（全屏名牌是噪音，这个取舍本身没错），于是远处只剩地面光环的色相。红绿色盲（男性约 8%）下红与绿都塌成同一团黄——**两个威胁完全不同的词缀变成同一个东西**，而巨力是 1.6 倍接触伤害、迅捷是 1.65 倍移速，认错代价很实在。

同样的问题在子弹上：敌方酸弹 `#7be23a`、玩家弹 `#ffb43c`，红绿色盲下也是同一种黄。

### What was done

- `EliteAffix` 新增 `badge: 'chevron' | 'wedge' | 'dots'`，`src/render/eliteBadge.ts`（新）把它画在敌人头顶。**颜色保留不动**——正确的做法是加一条冗余通道，而不是换掉颜色。
  - 三个轮廓刻意在「构成方式」上不同，而不只是坐标不同：双箭头（描边）/ 楔形三角（唯一有实心内部的）/ 三点（唯一由分离元素组成的）。灰度下依然互不相似。
  - 每个徽记都先用近黑色描一遍再上色，否则细线会被地面贴图和血迹吃掉。
  - **不设距离截断**：名牌只在近处有用，徽记是远处唯一能用的通道。
- 敌方子弹加深色描边弹头 + 亮色核心：不再只靠色相和玩家弹区分，轮廓本身就不一样。

### Testing

- `npx eslint .`、两个 TS 工程的 `tsc --noEmit`、`npm run build`：各自单独执行，退出码均为 0。
- `npm test`：38 个文件 247 个测试（新增 5 个）。`tests/eliteBadge.test.ts` 用一个**记录几何、丢弃颜色**的假 renderer——断言的正是「颜色没了之后还剩什么」：三个徽记的几何互不相同、`dots` 是唯一用 `drawCircle` 的、两个描边徽记的段数不同、每个都含近黑描边、最小尺寸下不会退化成空。这条测试的意义是拦住「以后有人把两个徽记画成一样，颜色又变回唯一通道」。
- 浏览器实测：把三个词缀分别挂在近处（150px，有名牌）和远处（430px，超过截断）的敌人上，同一帧分别以正常 / 氘色盲 / 红色盲 / 蓝色盲 / 纯灰度五种滤镜截图。**氘色盲那张正好证明了问题成立**——三种词缀色确实塌成同一团黄，名牌和光环都认不出，只有徽记还能分辨。纯灰度下 `^^` / `▲` / `∴` 同样清晰。子弹另做一组对照：六发并排，敌方三发的描边弹头在氘色盲与灰度下都和玩家弹明显不同。

### Notes

- `src/data/elites.ts`（+badge 字段）、`src/render/eliteBadge.ts`（新）、`src/render/worldRenderer.ts`（挂载徽记 + 敌弹描边）、两个 README。
- 徽记尺寸 `min(17, 敌人半径)`，`drawEliteBadge` 内部再钳到 ≥9px——第一版按 `半径 * 0.8` 画出来太小，三点几乎看不见，是看截图调的。
- 顺带核对过其它可能只靠颜色的地方，结论是都已经有第二通道：升级卡的 trait / 进化有文字标签（`.k`）、买不起是透明度不是红色、连击档位有名字、技能冷却是数字、油桶点燃有闪烁和光圈、预警圈按类型换的是形状不是颜色。
- 回滚方式：回退本任务对应提交。

## 2026-09-15 - Task: 拆掉 game.ts 这个上帝对象

### What was done

`src/game.ts` 到了 1467 行，里面塞着四件互不相干的事：状态机、世界渲染、HUD 快照、元进程存档。按职责切成三块（纯搬运，没有行为改动）：

- **`src/render/worldRenderer.ts`（新，605 行）** —— 世界渲染的全部：地面平铺、掩体投影与深度排序、酸池、预警圈、`drawWorld` 的 actor/bullet 分层、屏幕分级（大气、边缘辉光、低血量暗角）。血迹（`BloodDecals`）、尸体（`CorpseFX`）、精灵图集（`AssetStore`）、逐帧复用的障碍缓冲、脚步计数一并搬进来——它们本来就只有渲染在读。对 `GameContext` **只读**：帧率、图集、无障碍设置都改变不了一局种子的走向。
- **`src/ui/hudData.ts`（新，179 行）** —— `buildHudData(ctx)` 是纯函数，把整个上下文读成一份扁平快照；`passiveList` / `evoHint` / 威胁等级一并搬过来。DOM 层退化成这份快照的哑渲染器。
- **`src/loadout.ts`（新）** —— `primaryWeapon(lo)`，原本在 `game.ts` 里被渲染、HUD、结算页三处调用。

`game.ts` 1467 → 762 行，`render()` 缩成两行转发。

**顺带收紧了 lint 的作用域**：确定性规则（禁 `Math.random` / `Date.now` / `performance.now`）的豁免列表从 7 项减到 3 项——`src/main.ts`、`src/game.ts`、`src/ui/**`、`src/audio/**` 拆完之后已经一次都不读时钟了，现在它们也受规则管。这是这次拆分最实际的收益：**规则覆盖的代码变多了**。

### Testing

- `npx eslint .`、`npx tsc --noEmit -p tsconfig.json`、`npx tsc --noEmit -p tsconfig.tools.json`、`npm run build`：**各自单独执行并检查退出码**，均为 0（上一轮的教训）。
- `npm test`：37 个文件 242 个测试通过（新增 8 个）。
- **`tests/hudData.test.ts`（新）** —— 这是拆分的回报：HUD 逻辑以前要有 canvas、有 DOM、有一局真实运行才能碰，现在是纯函数。覆盖槽位占用字符串、主武器与满级进度、Boss 血条与威胁行切换、道具栏只列真正持有的（buff 过期即消失）、被动列表顺序与 trait 标记、进化提示的三个状态、`primaryWeapon` 的三级回退。
- 浏览器实测（Playwright + Chromium）：标题页、开局、40 秒实战。掩体（车辆 / 矮墙 / 石堆）、油桶、空投箱、血迹、金币、经验、子弹、尸潮、玩家与枪口闪光全部正常绘制且深度排序正确；HUD 四块面板实时更新；console 零报错（只有一个与本次无关的 favicon 404）。

### Notes

- 纯搬运：没有改动任何玩法数值或系统管线，`runSystems` 一行未动。
- 一处行为差异是刻意的：`resetRun()` 会把脚步计数归零（原先跨局保留）。纯表现，影响不到模拟。
- 回滚方式：回退本任务对应提交。

## 2026-09-14 - Task: 修复 ESLint --fix 造成的编译失败

### What happened

上一个提交（`869f3cd`）**推上去时是编译不过的**。`eslint --fix` 把 `ui.ts` 里 8 处 `querySelector(...) as HTMLElement | null` 当成「多余断言」删掉了——但 `querySelector` 返回的是 `Element | null`，那个断言是真实的收窄，删掉之后 `.onclick` 不存在于 `Element` 上。

我没发现，是因为我把校验命令写成了 `npm run typecheck 2>&1 | tail -2 && git commit ...`：**管道的退出码是 `tail` 的，永远是 0**，于是 `&&` 链照常往下走，把一个 8 处编译错误的提交推了上去。

### What was done

- 把 `ui.ts` 里全部 44 处 `querySelector` 改成泛型形式 `querySelector<HTMLElement>('...')`：比类型断言更干净，编译器拿到需要的元素类型，规则也没有断言可挑剔。其中 8 处可选查询（`#ui-ach-btn` / `#ui-set-btn` / `#ui-talent-btn` / `#t-refund` / `#pause-settings` / `#lv-reroll` / `#end-endless` / `#end-sameseed`）保留 `| null` 语义不加 `!`。

### Testing

- `npm run typecheck`、`npx eslint .`、`npm run build`：**各自单独执行并检查退出码**，均为 0。
- `npm test`：36 个测试文件 234 个测试通过。
- 浏览器实测被改动的 8 个可选 handler 全部可用：成就页、设置页、天赋页、天赋购买与「全部退还」（并确认 `zs-save` 中 `talents` 被清空）、暂停页设置入口、暂停→设置往返；console 零报错。

### 教训

**不要把构建/校验命令通过管道塞进 `&&` 链**——管道退出码属于最后一个命令。校验要单独跑并显式检查 `$?`，或者开 `set -o pipefail`。这次是 lint 自动修复引入的问题，恰恰被我用来确认「没问题」的那条命令掩盖了。

### Notes

- `src/ui/ui.ts`：44 处 querySelector 改泛型。
- 回滚方式：回退本任务对应提交。

## 2026-09-14 - Task: 接入 ESLint——规则挑那些真能拦住 bug 的

### What was done

- 仓库此前**完全没有 lint**（`devDependencies` 里连 eslint 都没有），只有 `tsc --noEmit`。接入 `eslint` + `typescript-eslint` 的 `recommendedTypeChecked`（类型感知规则才值这个钱——这个代码库里可能出事的是漂移的 promise 和静默的 any，不是格式）。
- **三条针对这个项目的规则，才是重点**：
  - `src/` 的模拟层禁用 `Math.random` / `Date.now` / `performance.now`。整套无头测量、种子分享、每日挑战都建立在「模拟是种子的纯函数」之上；某个系统里混进一个 `Math.random` 会同时废掉这三样，而且是静默的，通常要很久之后以「某个测试偶尔挂」的形式才暴露。渲染 / UI / 音频 / FX / `game.ts` / `seed.ts` 在豁免列表里——它们本来就该读时钟。
  - `save.ts` 之外禁止直接访问 `localStorage`。理由和上一轮合并存档一样：九个入口的持久化没有版本故事可言。
  - `no-console`（tools 与 tests 除外）、`eqeqeq`。
- 调整 TS 工程结构：主工程（`src` + `tests`）保持**浏览器专用**（`types: ["vite/client"]`），新增 `tsconfig.tools.json` 给 `tools/` 与 `vite.config.ts` 加 node 类型。这样游戏代码在类型层面就够不到 node API。`npm run typecheck` 两个工程都查，`npm run build` 依赖它。
- CI 新增 Lint 步骤（在 typecheck 之前）。
- `npx eslint . --fix` 清掉 163 处自动可修问题（绝大多数是测试里多余的 `!` 断言）。

### Testing

- `npm run lint`：0 错 0 警。
- `npm run typecheck`：两个工程均通过。
- `npm test`：36 个测试文件 234 个测试全部通过（自动修复未改变任何行为）。
- **验证了三条自定义规则确实会拦**：在 `movement.ts` 里植入 `Math.random()` 与 `Date.now()`、在 `progression.ts` 里植入 `localStorage.getItem`，eslint 报出 3 条对应错误并带上各自的解释；验证后已还原，`eslint .` 重新为 0。

### Notes

- `eslint.config.js`、`tsconfig.tools.json`：新增。
- `package.json`：`lint` 脚本、`typecheck` 覆盖两个工程、`build` 依赖 `typecheck`；新增 devDependencies `eslint` / `@eslint/js` / `typescript-eslint` / `@types/node`。
- `.github/workflows/ci.yml`：Lint 步骤。
- 多个测试文件：自动修复移除多余类型断言。
- 回滚方式：回退本任务对应提交。

## 2026-09-14 - Task: 存档版本化——单一入口、逐字段降级、迁移与备份

### 起因

此前 9 个 localStorage 键散落在 `game.ts`（8 处）与 `settings.ts`（1 处），**没有任何版本字段**。这在第一次改动数据形状之前都没问题——之后老存档要么让读取崩溃、要么被静默丢弃，而一个攒了一周老兵经验的玩家会在毫无提示的情况下失去全部进度。这是整份清单里唯一「不修会真伤到人」的一条。

### What was done

- 新增 `src/save.ts`：**一个键、一个版本号、一次校验**。
  - 用 zod（已是依赖）逐字段校验，**每个字段都带 `.catch()`**——这是关键：一个坏值不能让它周围的对象一起失效。zod 默认会因为一个 NaN 否决整份存档。
  - 本文件任何函数**都不抛异常**。损坏、截断、手改过的存档逐字段降级到默认值，而不是整份丢弃：丢一个最佳时间可以接受，丢全部不行。
  - 写入前把上一份好数据留到 `zs-save.bak`，读取时按 主键 → 备份 → 旧键 → 空档 依次回退。写到一半被配额打断不会毁掉存档。
  - `writeSave` 返回布尔值，让调用方能区分「存上了」和「假装存上了」。
  - 迁移链 `MIGRATIONS[n]` 把版本 n 升到 n+1，纯函数、全函数。来自**更新版本**的存档照读不误，不丢弃。
- `settings.ts` 只保留形状与默认值（`SettingsSchema`），持久化交给 save 层。
- `game.ts` 的 8 处 `localStorage.setItem` 全部换成一个 `persist()`，读取变成构造函数里的一次 `loadSave()`。

### 实测中发现并修掉的一个设计缺陷

浏览器实测老玩家迁移路径时，数据全部正确读出来了，但 **`zs-save` 是 `null`**——迁移只发生在读取时、从不落盘。后果是旧的 9 个键一直是事实来源；一旦之后 `zs-save` 损坏，读取会**回退到陈旧的旧键数据**而不是备份，把玩家静默回滚而不是恢复。

改成迁移时立刻写回（因此这个读取函数有副作用，已在注释里写明原因）。**旧键刻意保留不删**，作为降级路径；`zs-save` 一旦存在就总是优先。

### Testing

- `npm test`：36 个测试文件 234 个测试全部通过（新增 `save.test.ts` 17 项）。
- `npm run build` 通过。
- 测试用一个可切换为「抛异常」的内存 localStorage，覆盖：全新档默认值、完整往返、写入盖版本号；**彻底损坏的 JSON**、**单字段损坏时邻居字段存活**、**类型正确但数值越界被钳制**、**主档损坏时回退到备份**；存储拒绝读/写时仍返回可用档且写入如实返回 false；9 个旧键的完整迁移、部分迁移、**旧键本身损坏时可读的那半仍然过来**、迁移后写回、旧键保留、已有新档时优先新档；`clearSave` 清空全部；**来自更新版本的存档被读取而非丢弃**。
- 浏览器实测：植入老格式的 9 个键后打开游戏，标题页正确显示「成就 3/22」「残骸 430」「最佳生存 04:25」「重装 Lv.4」，设置页音量 30 / 静音开启，`zs-save` 已写回且版本为 1，console 零报错。

### Notes

- `src/save.ts`、`tests/save.test.ts`：新增。
- `src/settings.ts`：改为只导出 `DEFAULT_SETTINGS` / `SettingsSchema` / `Settings`。
- `src/game.ts`：`persist()` 统一写入；构造函数单次 `loadSave()`。
- `tests/seed.test.ts`：原本内联的 settings 测试移入 `save.test.ts`。
- 回滚方式：回退本任务对应提交。旧的 9 个键未被删除，回退后老存档照常可读。

## 2026-09-14 - Task: 回退母株削弱——它针对的问题不存在

### 诊断

上一轮按「腐蚀母株击杀率 20% vs 母巢暴君 61%」削弱了母株（召唤间隔 7→9.5、狂暴阈值 50%→35%），复测只把倍差从 3.05 拉到 2.73，等于没用。第三次改动（酸池寿命）之前先做了一件本该最先做的事：**把失败的局拆开看是怎么失败的**。

| Boss | 打到 | 击杀 | 战死 | 超时没打完 |
|---|---|---|---|---|
| 母巢暴君 | 13 | 10 | 1 | 2 |
| 腐蚀母株 | 20 | 5 | **1** | **14** |

**母株二十场只杀死玩家一次，和暴君的十三场一次是同一水平。她从来就不是更致命的那个。** 失败的 14 场全是没能在时限内打死她。

原因是测量方法本身：无头模拟的 300 秒上限对上 240 秒出场的 Boss，**只留 60 秒 Boss 战**，于是「难杀」被记成了「打输」。而真实游戏没有时间上限，这个失败模式对真人根本不存在。

解除时限（600 秒上限）重测，差距基本消失：

| Boss | 打到 | 击杀 | 战死 | 超时 |
|---|---|---|---|---|
| 母巢暴君 | 13 | 12（92%） | 1 | 0 |
| 腐蚀母株 | 20 | 16（80%） | 1 | 3 |

### What was done

- `SIEGE_SUMMON_INTERVAL` 回到 7、`SIEGE_ENRAGE_AT` 回到 0.5，并把理由写进常量注释——避免以后有人再照着那个伪指标改一遍。
- **保留** `SIEGE_ENRAGE_AT` 这个具名常量本身（上一轮顺带做的代码改进，原本是内联的 `0.5`）：回退的是数值判断，不是代码质量。
- 上一轮那条 progress 记录**保留不动**。它记录的是真实发生过的尝试与失败，删掉等于抹掉过程。

### 期间还做了

- `.gitignore` 新增 `tests/_*.test.ts`：平衡工作会不断需要一次性脚本（参数扫描、A/B 网格、这次的诊断），它们是为单个决策搭的脚手架而非该留下的测试，此前每次都留下未跟踪文件。

### Testing

- `npm test`：35 个测试文件 221 个测试全部通过。
- `npm run build` 通过。
- 无头模拟诊断与复测数据如上两表（每表约 100 局）。

### 教训

这一轮在母株身上连续错了三次判断（压力叠加 → 酸池覆盖 → 都不是），每次都是「看起来合理的局部推理 + 一次昂贵的复测」。最后解决问题的是一个两行的诊断：把失败拆成「战死」和「超时」。

**先问「它是怎么失败的」，再问「哪个数值该调」。** 另外，任何带时间上限的指标，都要先确认这个上限本身不会制造失败模式。

### Notes

- `src/data/enemies.ts`：两个常量回退 + 注释说明为何不要再改。
- `.gitignore`：一次性测量脚本约定。
- 回滚方式：回退本任务对应提交。

## 2026-09-13 - Task: 削弱腐蚀母株的压力叠加（部分见效，未达目标）

### 起因

40 种子 × 3 干员的分项报告显示两个 Boss 的难度差了三倍：母巢暴君击杀率 61%（n=41），腐蚀母株 20%（n=44）。开局抽 Boss 因此变成一次难度抽签，而不是多样性。

判断压力主要来自**叠加**——酸池封锁地面的同时盾卫堵住退路——所以选择削叠加而不是笼统砍血量（砍血量会让它变成软柿子，丢掉「夺地面」的身份）。

### What was done

- `SIEGE_SUMMON_INTERVAL` 7 → 9.5 秒。
- 狂暴阈值从内联的 0.5 提为具名常量 `SIEGE_ENRAGE_AT`，并由 50% 降到 35%，缩短最难的那一段。

### 复测结果（40 种子 × 3 干员）

| | 母巢暴君 | 腐蚀母株 | 倍差 |
|---|---|---|---|
| 改动前 | 61%（n=41） | 20%（n=44） | 3.05× |
| 改动后 | 82%（n=38） | 30%（n=54） | 2.73× |

**没达到目的。** 母株从 20% 升到 30%，但暴君同时从 61% 升到 82%，倍差只从 3.05 降到 2.73。

两点说明：
- 两次采样之间落地了两把新武器（光棱束 / 链式电弧），所以**绝对值不可比**——玩家整体变强了。可比的是同一次运行内两个 Boss 的倍差，那个指标只改善了约 10%。
- 改动本身是正向的、且符合它的身份，所以保留；但它显然不是主因。

### 下一步的判断（未执行）

真正的主因很可能是**酸池覆盖率**而非召唤：每 4.2 秒落 3 发、每发留 6 秒，稳态下场上恒定有 `3 × 6 / 4.2 ≈ 4.3` 个半径 92 的酸池。那已经不是「封锁一片地」，而是一片跟着玩家走的永久禁区。把池子寿命降到 3.5 秒会让稳态降到约 2.5 个——保留封地的身份，去掉「永久」。

### Testing

- `npm test`：35 个测试文件 221 个测试全部通过。
- `npm run build` 通过。
- 平衡复测如上表（每组 120 局）。

### Notes

- `src/data/enemies.ts`：`SIEGE_SUMMON_INTERVAL`、新增 `SIEGE_ENRAGE_AT`。
- `src/systems/enemyAI.ts`：狂暴判定改用常量。
- 回滚方式：回退本任务对应提交。

## 2026-09-13 - Task: 两把「关于站位」的武器——光棱束与链式电弧

### What was done

- 武器此前只有 `aim` / `nova` / `orbit` 三种 kind，16 个条目里绝大多数是「朝鼠标生成子弹」的数值变体——霰弹枪和冲锋枪的**玩法**区别只有弹丸数和冷却。新增两种 kind，各带一把武器与进化：
  - **光棱束**（`beam`）：一道持续光束，伤害射线上的所有目标，**被掩体阻断**。它要的是一条干净的射线，于是地形决定你能站在哪。进化「裂界光刃」扇出三道。
  - **链式电弧**（`chain`）：在尸体之间跳跃，每跳衰减 18%，人越密跳得越远，人一散就断链。进化「雷神之怒」跳 7 次。
  - 两者**方向相反**：一个要开阔射界，一个要被包围——这正是原本的武器表给不出的决策。
- 复用既有 def 语义而不是另起一套：`projectiles` 是光束数/跳跃数，`spread` 是进化光束的扇角，`range` 是射程/搜索半径。只有光束**厚度**需要新字段，于是加了 `width`——没有去挪用 schema 里写明「单位是弧度」的 `spread`。
- 掩体射线检测抽成 `obstacles.ts` 的 `rayReach`；钩刺者原本自己写了一份几乎一样的视线判定，现在共用。
- 进化配方：光棱束配冻伤、链式电弧配磁能拾取——**磁能拾取第一次有了配方**，此前它是唯一没被任何进化用到的数值型强化。

### Testing

- `npm test`：35 个测试文件 221 个测试全部通过（新增 `positionalWeapons.test.ts` 9 项）。
- `npm run build` 通过。
- 关键用例：光束打穿一条线上的三个目标而不是只打第一个、光束宽度外的目标不掉血、**隔着掩体打不到后面的目标**（并先断言掩体确实在射线上）；电弧在密集群中命中多个、**同一次施放不会重复命中同一目标**、目标散开时链条断掉；两把进化形态的参数确实更强；所有进化配方指向真实武器与强化。
- 平衡（16 种子 × 3 干员 × 300s）：光棱束出场率 25%、链式电弧 46%，两把都进入了流通。
- 顺带修了一个**脆弱用例**：`simHarness` 里「商店是否被使用」原本钉在单个种子上，新增两把武器改变随机序列后就失败了——改成跨 4 个种子断言「至少一局买到技能」且「关闭商店时一局都不买」。

### Notes

- `src/data/schemas.ts`：`kind` 枚举增加 `beam` / `chain`，新增可选 `width`。
- `src/data/weapons.ts`：两把武器 + 两个进化 + 两条配方。
- `src/systems/weapons.ts`：`fireBeam` / `fireChain`。
- `src/data/obstacles.ts`：`rayReach`；`src/systems/enemyAI.ts` 的 `hasLineOfSight` 改为调用它。
- `tests/positionalWeapons.test.ts` 新增；`tests/simHarness.test.ts` 去脆弱化。
- `README.md`、`README.zh-CN.md`：武器说明由「八把」改为「十把」并描述两把新武器。
- 回滚方式：回退本任务对应的两个提交。

### 一个需要注意的副作用

武器池从 8 把变成 10 把，等于**进一步稀释了升级卡池**——上一轮刚把进化达成率从 6% 拉到 28%（靠重抽/移除），这次新增武器会把它往回压一点。本轮的 16 种子样本里进化达成率 0–6%（未使用重抽的 greedy 策略），与新增武器前的同策略数据一致，但样本太小，下次大样本时需要专门盯一下这个数字。

## 2026-09-13 - Task: 第二个 Boss「腐蚀母株」与持续性地面危害

### What was done

- 整局原本是一条 4 分钟漏斗，终点只有母巢暴君，无尽模式也只是同一场仗乘血量。新增第二个 Boss，**开局由种子抽一个**，无尽模式两个轮流回归。
- **腐蚀母株**（`behavior: 'siege'`）：几乎不动（移速 22），保持 260px 距离，靠夺取地面施压——
  - **推进弹幕**：每 4.2 秒预警一串炮击，第一发打当前位置，其余沿玩家朝向每隔 105px（略大于爆炸半径，读起来是一条线而不是一坨）依次落下；预警 0.95 秒起，逐发错开 0.18 秒。**站着不动是唯一会吃满全部炮弹的走法。**
  - **酸池**：每发落点留下持续 6 秒的 `Hazard`，每 0.5 秒结算一次伤害。
  - **召唤盾卫**（而非疾跑者）：堵住你唯一的退路，让「直线走出酸池」不成立。
  - 血量低于 50% 狂暴：炮弹 3 → 5 发，召唤 2 → 3 只。
- 新增 `Hazard` 组件与 `hazardSystem`：按 tick 结算而非逐帧，既让"在酸里待半秒"是失误而不是暴毙，也让伤害与帧率无关（确定性模拟要求）。**只伤玩家**——尸群踩自己的酸会像 bug，Boss 毒死自己的援军更是。
- 预警系统扩展：新增 `'acid'` 类型，并支持**标记实体**（`spawnTelegraphMarker`）——一个组件只能挂一个预警，标记实体让同一个攻击者可以同时在场上放多个圈；解析后标记自动销毁。
- HUD 的 Boss 血条现在显示名字（此前硬编码「母巢暴君」）；`Director.bossId` 记录本局抽到谁。

### 过程中修掉的两个真问题

1. **酸池反而在保护玩家**。`damagePlayer` 无条件给 0.6 秒无敌帧，而酸池 tick 间隔 0.5 秒——站在酸里等于对丧尸免疫一半时间，和「地面封锁」的意图完全相反。`damagePlayer` 增加 `grantIFrames` 参数，持续伤害不再发放无敌帧（但仍然尊重已有的）。
2. **机器人看不见酸池**（和上一轮油桶同一个教训）。补上后 Boss 击杀 6 → 9，中位存活不变——它现在会绕开，说明预警与池子边缘是可读的。

### Testing

- `npm test`：37 个测试文件 211 个测试全部通过（新增 `siegeBoss.test.ts` 10 项）。
- `npm run build` 通过。
- 关键用例：40 个种子抽满两个 Boss、显式 cycle 可确定性指定（测试与无尽模式都靠它）；弹幕开火即产生 N 个预警且**预警期间零伤害**；炮弹沿朝向铺开（落点 x 跨度 > 40px）而非叠在一点；落点生成酸池、标记实体自行销毁、酸池到期消失；召唤的是盾卫；酸池按 tick 结算（同一瞬间连续 20 帧不重复扣血）、**不发放无敌帧**、池外不掉血、不伤尸群。
- 既有用例调整：两个 Boss 专属用例改为 `spawnBoss(ctx, 1, 0)` 显式指定暴君；无尽用例改为按实际抽到的 Boss 断言血量缩放，并新增「无尽会轮换两个 Boss」。
- 浏览器实测：临时把 `bossAt` 调到 18s 取景，HUD 血条正确显示「腐蚀母株」，预警圈与酸池渲染可读，console 零报错；验收后已还原。
- 平衡（14 种子 × 3 干员 × 300s）：抵达 Boss 32/42，**暴君击杀率 42%、母株 20%**——新 Boss 明显更难。样本太小（n=12 / n=20），**本轮不据此调数值**。

### Notes

- `src/systems/hazard.ts`、`tests/siegeBoss.test.ts`：新增。
- `src/data/enemies.ts`：`siege` def + `SIEGE_*` / `ACID_POOL_*` 常量；`schemas.ts` behavior 枚举扩展。
- `src/components/index.ts`：`Hazard`，`Telegraph.kind` 增加 `'acid'`。
- `src/factory.ts`：`spawnHazard` / `spawnTelegraphMarker` / `BOSS_IDS`，`spawnBoss(ctx, hpMul, cycle?)` 记录 `director.bossId`。
- `src/systems/enemyAI.ts`：siege 行为；`src/systems/telegraph.ts`：acid 类型与标记清理；`src/systems/combat.ts`：`grantIFrames`。
- `src/sim/aiInput.ts`：机器人感知酸池；`src/sim/headless.ts`：`SimResult.bossFought`；`tools/balance.ts`：Boss 分项。
- `src/game.ts`：`drawHazards`、HUD `bossName`；`src/ui/ui.ts`：`HudData.bossName`。
- `README.md`、`README.zh-CN.md`：敌人表与特性说明。
- 回滚方式：回退本任务对应提交（无存档格式变更）。

## 2026-09-13 - Task: 升级重抽与移除——同时解决进化不可达与金币无出口

### 起因

上一轮的平衡报告给出两条未修的发现：武器进化达成率 0–3%，以及中位局末持有 7058 金币（商店最贵道具 46）。本轮先查了前者的成因，再一次性解决两者。

**诊断（有数据）**：一局约 18–24 次升级，池子 12+ 项、每次抽 3 张，所以某张特定卡出现率约 20%；而配方需要 5 次特定武器升级 + 3 次特定强化 = 8 次特定命中，期望只有 4–5 次。观测到的最高武器等级 4.0 与推算完全吻合——**配方要 6 级，一局只发得出 4 级**。更麻烦的是第二层：所有武器同时开火，广度就是 DPS，专精策略的角色等级只有 10.9 而铺开策略是 17.8——**进化唯一的路恰好是结构上最弱的打法**。

结构参数网格（武器槽 × 满级，12 种子 × 3 干员）显示只有砍到「槽 3 / 满级 5」才让普通打法的进化率跳到 19%，代价是配装多样性。用户选择了机制解而非数值解。

### What was done

- **重抽**：升级页花金币重摇整桌，价格线性递增（20 / 35 / 50…）。热键 `R`。
- **移除**：花金币把某张卡的**主体**（那把武器或那条强化）踢出本局池子，价格按 1.7 倍复利递增（60 / 102 / 173…），所以清空池子永远够不到。移除后只补该槽位一张，另两张留在桌上——移除不能当便宜的重抽用。
- `choiceKey` 按主体而非卡面取键：移除「霰弹枪 Lv.2→3」等于把霰弹枪整个移出本局。进化卡与兜底卡返回 `null`，**不可移除**——即使武器被移除，它的进化卡照样强制占第一张。
- `makeChoices(ctx, keep)` 支持排除已移除项与保留桌上其他卡。
- 机器人同步学会这套机制（仅 `focus` 策略使用），于是 greedy vs focus 成了这个功能本身的干净前后对照，而不只是打法差异。

### 效果（12 种子 × 3 干员 = 36 局/组）

| | 进化达成 | 局末中位金币 | 平均重抽 | 平均移除 |
|---|---|---|---|---|
| 不使用（greedy） | 0 / 36 | 2471 | 0 | 0 |
| 使用（focus） | **10 / 36（28%）** | **233** | 7.6 | 1.3 |

功能上线前，专精打法的进化率是 2/36（6%）。两条发现都被解决：**进化 6% → 28%**，**金币 2471 → 233**。

诚实的附注：focus 的角色等级 10.9、胜场 1，仍低于 greedy 的 17.8 / 2。重抽解决的是「抽不到」，没解决「专精本身更弱」——后者是武器同时开火的结构问题，要靠砍武器槽（网格里「槽 3 / 满级 5」那一组）才能动，本轮未做。

### Testing

- `npm test`：35 个测试文件 201 个测试全部通过（新增 `reroll.test.ts` 10 项）。
- `npm run build` 通过。
- 关键用例：重抽价格线性、移除价格复利且第 6 次超过首次 20 倍；`choiceKey` 对同一武器的「新增」与「升级」返回同一键、对进化与兜底返回 null；被移除项在 60 次抽取中从不出现；移除后另两张保留且补位不重复；**移除确实提高目标卡出现率**（对照测量，后者 > 前者 ×2）；几乎全部移除后仍返回 3 张；被移除武器的进化卡仍强制占第一张；已持有的强化被移除后不再升级。
- 浏览器实测：升级页每张卡右上角 `✕ 60`、下方「重抽 · 20 金币 (R)」与金币提示；重抽后桌面变化且价格 20→35、金币 118→98；移除第一张后另两张原样保留、被移除项消失；全程 console 零报错。

### Notes

- `src/data/balance.ts`：`rerollCost` / `banishCost` 与常量。
- `src/ctx.ts`、`src/systems/combo.ts`：`RunState.rerolls / banishes / banished`。
- `src/progression.ts`：`choiceKey`、`makeChoices(ctx, keep)` 与排除逻辑。
- `src/game.ts`：`renderLevelUp` / `reroll` / `banish`，`R` 热键。
- `src/ui/ui.ts`：`LevelUpShaping`、卡片移除按钮与重抽行、相关样式。
- `src/sim/headless.ts`：`shapeOffer`、`onPlanChoice`，`SimResult` 增加 `rerolls` / `banishes`。
- `README.md`、`README.zh-CN.md`：操作表与特性说明。
- 回滚方式：回退本任务对应提交（无存档格式变更）。

## 2026-09-13 - Task: 把无头模拟从回归网变成调数值的工具

### What was done

- **重写脚本 AI**（`src/sim/aiInput.ts`）：旧机器人只是「远离最近的一只丧尸」，于是径直走进另外三只，中位存活 37 秒——**连第 2 阶段都到不了**，用它测出来的任何数字都只描述开局 90 秒。新版用 context steering：一次收集周围威胁场，然后对 16 个候选朝向打分（威胁场、掩体、待触发的预警圈、附近战利品），选最高分。仍然不是好玩家，但能打完整局。
- **模拟器升级为测量工具**（`src/sim/headless.ts`）：`runHeadless(seed, seconds, opts)` 支持指定干员、老兵等级、天赋、选牌策略与是否用商店；结果从 5 个字段扩到完整一局的画像——局末配装与等级、持有强化、购买的主动技能、抵达阶段、金币、精英、连击、进化、**致死原因**。
- 机器人现在会**逛商店和放技能**（低血买急救包并立即使用、补护盾、阶段 3 起买主动技能、危急时屏障/迟滞/冲击/疾冲/手雷）。购买逻辑从 `Game.buyOffer` 抽成 `shop.ts` 的 `purchaseOffer`，玩家和模拟器**共用同一套规则**——模拟器用不了的商店等于测不了的商店。
- 新增 `npm run balance`（`tools/balance.ts`，vite-node）：多种子 × 多干员批量跑，输出 markdown 报告——各干员胜率/中位存活/进化达成、每把武器与每条强化的出场率与平均等级、主动技能购买率、死亡原因分布、各阶段抵达比例；`--json=` 可导出每局原始数据。
- 机器人自己的转向权重（`momentum` / `loot` / `soften`）作为 `BotTuning` 暴露出来，由 `SimOptions.bot` 注入——**尺子本身也要被测量**。

### 报告直接抓到的问题

1. **油桶在数学上无法躲开**。引信 0.35s × 基础移速 172 = 60px，爆炸半径 120px——贴脸引爆需要 343 px/s。首轮报告里油桶占全部阵亡的 **71%**。引信改为 0.8s（可跑 138px > 120px），并在 `tests/collision.test.ts` 里把这个不变量写成断言（`BARREL_FUSE × moveSpeed > BARREL_RADIUS`）。
2. **进化几乎无人达成**：首轮报告三个干员的进化达成率为 3% / 3% / 0%，武器平均等级 3.1–3.7（满级 6），强化平均 2.0（满级 5）。上一轮设计的「中期目标」目前是个没人够得到的目标。**未修，待决策**。
3. **金币后期没有出口**：中位持有 7058 金币，而商店最贵的道具 46。经济在中后期完全失效。**未修，待决策**。

### Testing

- `npm test`：34 个测试文件 191 个测试全部通过（新增 `simHarness.test.ts` 13 项）。
- `npm run build` 通过。
- 新用例覆盖：各干员起手武器正确、每套参数下确定性成立、选牌策略确实生效、开/关商店行为不同（以购得的主动技能为证据，而不是局末金币——不逛商店的那局死得更早所以赚得更少）、天赋确实作用于被测的这一局、配装字符串可被报告解析、威胁场在只看威胁时确实最小化、默认权重下不抖动。
- **油桶引信 A/B**（同一机器人，只改引信，20 种子 × 3 干员 = 60 局/组）：
  | 配置 | 阵亡 | 油桶致死 |
  |---|---|---|
  | 引信 0.35s | 21 / 60 | 33%（约 7 局） |
  | 引信 0.8s | 15 / 60 | **0%** |

### 过程中的两次自我纠错（都靠这套工具抓到）

- 第一次给机器人「调参」（惯性 2.5→0.05、衰减 900→400）让每个局部决策都更合理，实测却把胜率从 27% 打到 5%、中位存活 4:20 打到 2:21。参数扫描（10 种子 × 3 干员）显示 `soften=900, momentum=2.5` 最优（17% 胜率 / 260s 中位），即原始配置——**改动已回退**。随之删掉了两个过度规定策略的单测：它们断言的「局部正确」行为恰恰是全局更差的行为。
- 第一次油桶 A/B 的结论是「基本没变化」，原因是机器人**看不见点燃的油桶**，引信再长它也不会走开。给 `danger()` 加上点燃油桶后重测，才得到上表的结果。一把看不见某个危险的尺子，量不了针对这个危险的改动。

### Notes

- `src/sim/aiInput.ts`（重写）、`src/sim/headless.ts`（重写）、`tools/balance.ts`、`tests/simHarness.test.ts`：新增/重写。
- `src/shop.ts`：新增 `purchaseOffer`；`src/game.ts` 的 `buyOffer` 只保留表现层。
- `src/data/obstacles.ts`：`BARREL_FUSE` 0.35 → 0.8，附逃生距离推导注释。
- `package.json`：`balance` 脚本 + `vite-node` devDependency。
- `README.md`、`README.zh-CN.md`：新增「平衡报告」章节与命令表条目。
- 回滚方式：回退本任务对应提交（无存档格式变更）。

## 2026-09-13 - Task: 永久天赋树、残骸货币与公平的每日挑战

### What was done

- 新增元货币**残骸**：每局结算按 `存活×0.15 + 剩余金币×0.25 + 精英×3 + 暴君×60 + 胜利100` 产出，**输了也有**。按增量入账（无尽模式可能结算两次），存于 `zs-salvage`。此前金币局内清零、跨局只有干员经验与纯展示的成就墙——输了没有任何「下一局更强」的钩子。
- 新增**永久天赋树**（`src/data/talents.ts`，三分支九节点，全部是纯数据 + 纯函数）：
  - **战备**：前哨补给（起始生命 +10/级，5 级）→ 复合装甲（开局 1 层护盾/级，3 级）→ 战备金库（开局 25 金币/级，4 级）
  - **火力**：口径升级（伤害 +6%/级，5 级）→ 神射手（暴击 +3%/级，4 级）→ 改装工坊（进化所需被动等级 -1）
  - **生存**：拾荒者（拾取 +15%/级，4 级）→ 第二次呼吸（肾上腺素每局 2 次）→ 复活协议（每局一次原地复活，回 50% 生命 + 2s 无敌 + 震开尸群）
  - 分支内**按顺序解锁**，价格逐级递增；两个终点节点还要求对应成就（改装工坊需「终极形态」、复活协议需「清道夫」）——成就墙终于绑定实际解锁，而不只是打勾。
  - **全额退还**随时可用、无惩罚：不能撤销的 build 没人敢试。
- **每日挑战改为公平对局**：不套用天赋，也不套用干员老兵加成，并且不产出残骸。否则当日榜单排的只是谁刷得久。标题页与结算页都写明。
- `RunState.adrenalineUsed`（布尔）改为 `adrenalineLeft`（次数）并新增 `revivesLeft`，两处「翻盘」共用一个 `knockBackAround` 辅助函数。
- 购买在 Game 层**重新校验**一次 `buyState`，不信任点击——UI 只是视图，不是权威。

### Testing

- `npm test`：32 个测试文件 177 个测试全部通过（新增 `talents.test.ts` 17 项）。
- `npm run build`：TypeScript 与 Vite 产线构建通过。
- 结构性用例（会在以后加节点时自动兜底）：每级都有价格且**价格单调递增**、前置指向真实节点、成就门指向真实成就 id、每条分支恰好一个无前置起点、**前置链无环**。
- 行为用例：前置未满/成就未达/残骸不足/已满级四种拒绝路径各一条；退还金额恰等于投入；空树对属性零影响；等级正确折算进开局属性；改装工坊让进化需求降一级且**永不低于 Lv.1**；复活协议第一次致命伤复活、第二次致命伤真死、没买时照常死亡；残骸胜利恰好多 100、空局为 0。
- 浏览器实测（Vite dev + Playwright）：0 残骸时九个节点全锁且理由正确；900 残骸时三个起点可买；连买两级后「持有 815 · 已投入 85」且 `zs-talents={"vanguard":2}`；全额退还回到 900 / `{}`；带 `{vanguard:5,plating:2,warchest:2}` 开局 HUD 为 **HP 150/150、金币 50、1 个护盾槽**，阵亡结算显示「残骸 +16」且 `zs-salvage` 400→416；**每日挑战开局为 HP 100/100、金币 0、无护盾**，结算显示「公平对局 · 不计永久升级」且残骸 400→400 不变；全程 console 零报错。

### Notes

- `src/data/talents.ts`、`tests/talents.test.ts`：新增。
- `src/ctx.ts`：`RunState.adrenalineLeft/revivesLeft`、`PlayerStats.evoDiscount`；`systems/combo.ts` 的 `freshRunState` 同步。
- `src/systems/combat.ts`：复活协议（致命伤前拦截）、肾上腺素改用次数、`knockBackAround` 提取。
- `src/data/weapons.ts`：`evolutionReady` / `evolutionHint` 增加 `discount` 参数 + `requiredPassiveLevel`；`progression.ts`、`game.ts` 传入 `stats.evoDiscount`。
- `src/game.ts`：`salvage` / `talents` / `commitSalvage` / `saveMeta` / `openTalents` / `buyTalent` / `refundTalents`，开局按 `fair` 决定是否套用天赋与老兵等级。
- `src/ui/ui.ts`：`showTalents` 面板与样式、标题页「战备升级」入口、结算页残骸/公平对局芯片、`TitleData.salvage`、`RunSummary.salvage`。
- 新增 localStorage 键：`zs-salvage`、`zs-talents`（可手动清除）。
- 回滚方式：回退本任务对应提交。

## 2026-09-12 - Task: CI、三种施压型敌人与攻击预警系统

### What was done

- 新增 GitHub Actions CI（`.github/workflows/ci.yml`）：push 与 PR 上跑 typecheck → test → build，`node-version-file` 跟随 `.node-version`，开启 npm 缓存与同分支并发取消。此前 160 个测试没有任何人跑。
- **攻击预警系统**（`src/systems/telegraph.ts` + `Telegraph` 组件）：起手时把落点**冻结**在世界里，画成逐渐填充的地面圈，到时才结算。此前全游戏没有一个可预判的攻击——被打中只是「发生了」，而不是「我该躲开的」。
  - 顺带把**母巢暴君的震地**改成预警式（0.6 秒）。它原本是瞬发的，站在旁边就必吃，现在可以走出去。
  - 预警绘制在尸群**之下**，一堵尸墙挡不住警告——可读性就是这个机制的全部意义。
- 新增三种施压型敌人（每种惩罚一个习惯，而不是又一个「朝你走」）：
  - **盾卫**（95s 解锁）：正面弧内只放进 18% 伤害；盾牌转向限速 2.1 rad/s，所以正解是绕到背面——代价是穿过尸群。盾牌画在胸前对应方向，弱侧一眼可读。
  - **孵化体**（130s）：躲在后排每 5.5 秒孵化 2 只行尸，不优先处理场面会自己滚起来。
  - **钩刺者**（150s）：维持 210–420px 距离，甩钩前 0.75 秒画出预警线与落点圈，命中把玩家拽向自己 170px。**掩体挡视线就钩不到**（采样式线段检测，与子弹阻挡同一套规则）。
- `EnemyDef` 增加可选 `sprite` 字段：新原型复用既有美术（盾卫用 brute、孵化体用 spitter、钩刺者用 runner），而不是退化成纯色圆。
- 修了一个既有渲染缺陷：命中白闪画在碰撞体坐标上，而精灵是抬高绘制的，导致大体型敌人身旁地面上出现一个苍白圆盘。现在闪光与盾牌都挂在精灵视觉中心。

### Testing

- `npm test`：31 个测试文件 160 个测试全部通过（新增 `pressureEnemies.test.ts` 9 项，改写 director 的暴君用例）。
- `npm run build`：TypeScript 与 Vite 产线构建通过。
- 关键用例：盾卫正面只吃 `WARDEN_FRONT_MUL` 倍伤害、背面吃满、单帧转向不超过限速、其他敌人不受弧判定影响；孵化体按时孵化且计时未到不重复；钩刺者只在距离带内起手、近了远了都不起手、预警期间不位移不掉血、到期才拽人并造成伤害；**暴君震地在预警期间无伤，走出圈外完全不吃伤害**。
- 确定性：`runHeadless(9191,60)` 两次结果一致。
- 平衡对照（无头模拟 **n=24**）：本次 avgSec 45.6 / medSec 36.9 / avgKills 189.7，上一提交 47.5 / 37.4 / 195.7 —— 三种新敌人 95s 之后才解锁，脚本 AI 基本走不到，所以早期节奏没有变化；差异来自 `spawnEnemyAt` 多消耗一次 rng 导致的序列偏移。
- 浏览器实测（Vite dev + Playwright）：**临时**下调三种敌人的解锁时间与 cost 以便取景，截图验收盾卫盾牌位置、孵化体紫环、钩刺者预警线与落点圈，全程 console 零报错；验收后已还原 `enemies.ts` / `balance.ts`（`git diff` 确认仅保留正式改动）。

### Notes

- `.github/workflows/ci.yml`、`src/systems/telegraph.ts`、`tests/pressureEnemies.test.ts`：新增。
- `src/data/enemies.ts`：三个 def + 刷怪表条目 + 调参常量（`WARDEN_*` / `BROOD_*` / `LASHER_*` / `BOSS_SLAM_WINDUP`）；`schemas.ts` 扩展 behavior 枚举并新增可选 `sprite`。
- `src/components/index.ts`：`Telegraph` 组件、`EnemyRuntime.faceX/faceY/abilityCd`；`factory.ts` 初始化。
- `src/systems/enemyAI.ts`：三种行为、`turnToward`、`hasLineOfSight`，暴君震地改走预警。
- `src/systems/combat.ts`：盾卫正面减伤（弧判定基于命中方向与朝向点乘）。
- `src/systems/pipeline.ts`：`telegraphSystem` 注册于 `enemyAISystem` 之后。
- `src/game.ts`：`drawTelegraphs`、盾牌/孵化体渲染、`bodyY` 视觉中心修正、`def.sprite` 查表。
- `README.md`、`README.zh-CN.md`：敌人表与特性说明。
- 回滚方式：回退本任务对应提交（无存档格式变更）。

## 2026-09-12 - Task: 种子分享、每日挑战与设置面板

### What was done

- 种子系统（`src/seed.ts`）：整套模拟本来就由一个 uint32 完全决定，这次把它变成功能——`formatSeed` 打成 6~7 位大写码（base36），`parseSeed` 容错解析（忽略大小写与空格、拒绝非法输入）。结算页展示本局种子并提供「同种子再来」；标题页可直接输入种子码出击，输入框内按键不再穿透到全局热键。
- 每日挑战：`dailySeed(dailyKey())` 以玩家**本地日期**做 FNV-1a 哈希，当天所有人拿到完全相同的世界（地形、刷怪、空投开箱一致）。标题页显示日期、种子与当日最佳；当日成绩单独存于 `zs-daily`，只在刷新纪录时写入。
- 设置面板（`src/settings.ts` + `ui.showSettings`）：音量、静音、屏幕震动强度（可归零）、减弱闪烁、伤害数字开关；即时生效并写入 `zs-settings`，读取时做钳制与损坏兜底。标题页与暂停菜单均可进入，`Esc` 返回来处（不会误把暂停解掉）。
- **全部设置只作用于表现层**：震动只缩放渲染时的抖动幅度（模拟照常累积 `screen.shake`）、减弱闪烁只压低血月红幕/狂热光晕/濒死暗角的脉动、伤害数字在 `FX.text` 层按首字符是否为数字过滤（播报文本如「肾上腺素！」不受影响）。因此同一个种子在任何设置下都是同一局。
- `AudioBus` 补上主增益节点：此前所有音源直连 `destination`，没有音量概念；现在统一经由 `master`，`setVolume/setMuted` 实时生效，且在 AudioContext 尚未创建时也会被记住。
- `showTitle` 由 7 个位置参数重构为 `TitleData` 对象（已经到了看不出第几个参数是什么的程度）。
- 新增 `.quiet` 次级按钮样式：此前把成就/设置/种子都挂在 `.ghost`（粉色大 CTA）上会盖过「出击」，`.ghost` 现在只留给无尽尸潮。复选框改为自绘，避免浏览器默认白块打断暗色面板。

### Testing

- `npm test`：29 个测试文件 150 个测试全部通过（新增 `seed.test.ts` 11 项）。
- `npm run build`：TypeScript 与 Vite 产线构建通过。
- 关键用例：种子码往返一致（含 0 与 0xffffffff 边界）/ 大小写与空格容错 / 非法输入被拒 / 同日期同种子、跨日期不同 / `dailyKey` 按本地日期 / 设置默认值、往返、越界钳制、损坏 JSON 兜底。
- **端到端验证了 UI 的承诺**：`runHeadless(parseSeed(formatSeed(x)))` 与 `runHeadless(x)` 结果完全相同；同一 `dailySeed` 两次运行结果完全相同。
- 浏览器实测（Vite dev + Playwright 驱动）：标题页「今日挑战 · 2026-09-12 · 种子 12IKDX7 · 今天还没打过」正确；设置面板改动即时落库 `{"volume":0.3,...,"shake":0,"reduceFlashing":true,"damageNumbers":false}`；`Esc` 从设置返回标题、以及从暂停→设置→`Esc`→暂停均正确；非法种子提示「种子无效」；输入 `ZOMBIE` 成功开局，阵亡结算显示「种子 ZOMBIE」与「同种子再来」按钮；全程 console 零报错。
- 截图验收标题页按钮层级（出击 > 今日挑战 > 次级按钮）与设置面板配色。

### Notes

- `src/seed.ts`、`src/settings.ts`：新增。
- `src/audio/audio.ts`：`master` 增益节点 + `setVolume` / `setMuted` / `out()`；三处直连 `destination` 改为 `out()`。
- `src/fx/fx.ts`：`showNumbers` 开关（只过滤首字符为数字的伤害数字）。
- `src/ui/ui.ts`：`TitleData` 重构、`showSettings`、`showPause` 增设置入口、`showEnd` 增种子芯片与 `onSameSeed`、`RunSummary.seed/daily`、`.quiet` 与表单样式。
- `src/game.ts`：`start(operativeId, seedOverride?)`、`runSeed` / `runDailyKey` / `dailyRecords` / `settings`、`openSettings` / `applySettings` / `showPausePanel` / `saveDaily`、渲染层套用震动与闪烁设置、`settingsBack` 拦截 `Esc`。
- 新增 localStorage 键：`zs-settings`、`zs-daily`（可手动清除）。
- 回滚方式：回退本任务对应提交。

## 2026-09-12 - Task: 战场地形——程序化掩体、碰撞滑行、可爆油桶

### What was done

- 新增确定性程序化障碍场（`src/data/obstacles.ts`）：世界按 260px 网格划分，每格由 `(seed, cx, cy)` 纯哈希决定最多一个轴对齐掩体（车辆 / 集装箱 / 横竖路障 / 石堆，35% 密度）。世界是无限的（相机跟随），所以掩体不能手摆——纯函数换来无限地形、零内存与完全确定性；原点 ±2 格恒为空，开局不会被围死；每个掩体完整落在自己格内，因此查询只需扫描矩形覆盖的格子且结果精确。加了按 seed 的 memo 缓存（纯函数，整帧复用）。
- 打通 `ctx.seed`：`game.ts` 原本 `makeRng((performance.now()*1000)>>>0)` 生成后把种子直接丢弃，现在存入 `GameContext.seed`（顺带铺好后续种子分享 / 每日挑战的地基）。
- 新增 `src/systems/collision.ts`：`blockerSystem` 对玩家、非 Boss 敌人、僚机做圆 vs AABB 推出，并把速度投影到接触面切线实现**沿墙滑行**（没有滑行会贴墙卡死）；暴君无视掩体直接碾过。敌人 AI 增加 74px 内的切向绕行分量。**刻意不做 A\***：掩体全为凸形、稀疏、无凹形死角，"切向转向 + 接触滑行"表现即为丧尸沿墙蹭行，代码注释已写明以免后人误以为是漏做。
- 子弹**双向**被掩体阻挡（`bullets.ts`）：火箭在掩体上引爆，其余留火花后销毁。破视线因此成为喷吐者的正解——这是掩体产生玩法价值的核心一条。
- 新增可爆油桶：格子哈希决定位置（仅在无静态掩体的格），玩家靠近时按格激活并记入 `director.activatedCells`，因此炸掉的油桶不会复活。油桶随敌人一起插入同一个空间哈希，于是子弹 / 冲击波 / 环刃 / 手雷**无需改动任何武器代码**即可命中；`contactSystem` 要求 `Enemy` 组件，油桶天然不会误伤走过的玩家。被打空血后点燃 0.35 秒引信（闪烁预警）再炸：半径 120、伤害 90、连锁引爆、**对玩家同样生效**（没有风险就不是工具，只是免费伤害）。
- 生成点避让 `findFreeSpot`：空投箱、血怨祭坛、幸存者、环形刷怪都不会再卡在集装箱里。
- 渲染：掩体地面软阴影画在血迹/尸体之下；掩体本体加入既有的 `actorDepth` 深度排序，玩家走到车后会被正确遮挡（伪 3D 观感直接受益）。分层绘制（暗描边 + 本体 + 受光顶面 + 接地线）作为占位美术。

### Testing

- `npm test`：28 个测试文件 139 个测试全部通过（新增 `obstacles.test.ts` 7 项、`collision.test.ts` 8 项）。
- `npm run build`：TypeScript 与 Vite 产线构建通过。
- 关键用例：同种子同格恒等 / 不同种子布局不同 / 原点 ±2 格恒空 / 掩体不越格（邻格不可能重叠）/ 矩形查询覆盖精确 / 推出后不再重叠 / 贴墙斜向走 60 帧仍横向位移 > 40px（滑行生效）/ 双方子弹均被阻挡而空地不阻挡 / 油桶格只激活一次且炸毁不复活 / 油桶不吃击退不弹伤害数字 / 引信期间不伤人、到期炸伤周围。
- 确定性未被破坏：`tests/sim.test.ts` 同种子复现用例通过；另跑 `runHeadless(4242,45)` 两次结果完全一致。
- 性能实测：420 只敌人下 `enemyAISystem + blockerSystem` 合计 0.898 ms/帧（预算 16.7ms）。
- 浏览器实测（Vite dev + Playwright 驱动）：远离出生点后掩体/油桶正常出现并深度排序正确，长距离移动不卡死，全程 console 零报错；截图验收车辆/集装箱/路障/石堆/油桶五种外观可读。
- 平衡参考（无头模拟 8 种子 × 250s）：avgSec 68.0 / avgKills 512.4（Phase A 后为 92.4 / 967.5）。脚本 AI 没有地形意识、被掩体挡住逃生路线所以变差，属机器人局限而非数值退化——真人可以用掩体，机器人不会。

### Notes

- `src/data/obstacles.ts`：新增（网格、哈希、`cellObstacle` / `obstaclesInRect` / `blockedAt` / `resolveCircle` / `cellBarrel` + 油桶常量）。
- `src/systems/collision.ts`：新增（`blockerSystem` / `barrelSystem` / `igniteBarrel`）；`pipeline.ts` 在 `movementSystem` 之后注册，并把油桶一并插入空间哈希。
- `src/ctx.ts`：`GameContext.seed`、`Director.activatedCells`；`components`：`Barrel`；`factory`：`spawnBarrel` / `findFreeSpot` 与四处生成点接线。
- `src/systems/combat.ts`：油桶走敌人伤害通道但不吃击退/不弹数字/改为点燃；`explode` 增加 `cause` 参数（死亡结算会显示"油桶爆炸"）。
- `src/systems/bullets.ts`：掩体阻挡；`src/systems/enemyAI.ts`：切向绕行。
- `src/game.ts`：`drawObstacleShadows` / `pushObstacles` / `drawObstacle`、油桶渲染分支、`obstacleBuf` 复用缓冲。
- 7 个自带 ctx 的测试文件补 `seed` 字段；`tests/helpers.ts` 新增 `findObstacle`。
- `README.md`、`README.zh-CN.md`：新特性说明。
- 回滚方式：回退本任务对应提交（无存档格式变更）。

## 2026-09-12 - Task: Build 取舍——槽位上限、被动分级、条件进化、特性强化

### What was done

- 槽位上限：武器 6 / 强化 6（`WEAPON_SLOTS` / `PASSIVE_SLOTS`），满槽后升级卡不再提供同类新增，只提供已有项的升级——"三选一"从"哪个数字大"变成"放弃什么"。
- 被动分级：单条被动上限 Lv.5（`MAX_PASSIVE_LEVEL`），每级施加一次 `amount`；`GameContext.passives: Map<id, level>` 记录持有等级，驱动卡池、进化判定与 HUD。属性仍是增量修改（装备 buff 的 `buffUndo` 依赖这一点，未改成全量重算）。
- 条件进化：`EVOLUTIONS` 由 `Record<string,string>` 升级为配方表（`{ evo, passive, passiveLevel }`），八把武器各绑定一条被动、统一要求 Lv.3。条件满足时进化卡强制占据第 1 张，绝不会被随机掉；未满足时在对应被动卡上追加"· 解锁XX进化"提示，HUD 常驻显示最近一条未达成的进化需求。
- 新增 3 条特性强化（`kind: 'trait'`，改打法而非数值）：尸爆（击杀 18%/级 概率引爆尸体，60 伤害 r=70，不伤玩家）、冻伤（命中减速 12%/级，1.2 秒，封顶 55%）、背水（生命 < 40% 时伤害 +15%/级）。
- 卡池枯竭兜底：满槽满级后补 `bonus` 卡（+15 最大生命并回满 / +40 金币 / +1 层护盾），保证永远 3 张。
- 结算页新增"本局 Build"芯片行（武器 + 强化及等级），HUD 武器面板新增强化列表与 `武器 n/6 · 强化 n/6` 槽位预算。
- 顺带修掉一个既有缺陷：`makeChoices` 原本把 `-evo` 进化武器也当作"新武器"投进卡池，玩家可以跳过进化流程直接抽到终极形态；现已排除。

### Testing

- `npm test`：26 个测试文件 124 个测试全部通过（新增 `buildSlots.test.ts` 8 项、`traits.test.ts` 5 项）。
- `npm run build`：TypeScript 与 Vite 产线构建通过（131 模块）。
- 浏览器实测（Vite dev + Playwright 驱动）：开局 HUD 显示"武器 1/6 · 强化 0/6"；升级弹窗恒为 3 张卡且 `.k` 分类标签（武器/强化/特性/升级/进化）正确；取得磁能拾取后 HUD 追加"磁能拾取 Lv.1"并刷新为"强化 1/6"；阵亡结算页渲染出"手枪 Lv.1"Build 芯片；全程 console 零报错。
- 平衡回归（无头模拟 8 个种子 × 250s）：改动前 avgSec 39.5 / avgKills 46.4 / avgLevel 2.4，改动后 avgSec 92.4 / avgKills 967.5 / avgLevel 7.6——脚本 AI 不再被随机进化武器带偏，节奏没有退化。
- 确定性未被破坏：`tests/sim.test.ts` 的同种子复现用例通过。

### Notes

- `src/data/balance.ts`：`WEAPON_SLOTS` / `PASSIVE_SLOTS` / `MAX_PASSIVE_LEVEL` / `DESPERATE_HP_FRAC`。
- `src/data/weapons.ts`：`EvolutionRecipe` + `evolutionFor` / `evolutionReady` / `evolutionHint`。
- `src/data/passives.ts`：3 条 trait + 调参常量（`DETONATE_*` / `CHILL_*`）+ `passiveById`；`schemas.ts` 的 `PassiveDefSchema` 扩展 stat 枚举并新增 `kind`。
- `src/progression.ts`：`makeChoices` 重写（槽位门槛、`passive-up`、强制进化位、`bonus` 兜底）、`grantPassive`、`applyBonus`。
- `src/systems/combat.ts`：尸爆（`killEnemy`）与冻伤（`damageEnemy`）；`src/systems/weapons.ts`：背水（`rollDmg`）；`src/systems/enemyAI.ts`：冻伤速度乘算与过期；`components`/`factory`：`EnemyRuntime.chillUntil/chillMul`。
- `src/ctx.ts`：`PlayerStats` 新增 detonate/chill/desperate，`GameContext` 新增 `passives`；同步 4 处构造点（`game.ts`、`sim/headless.ts`、`tests/helpers.ts`、`tests/progression.test.ts`）与 5 个自带 ctx 的测试文件。
- `src/ui/ui.ts`：`HudData.passives/slots/evoHint`、`RunSummary.build`、进化/特性卡样式、`choiceKindLabel`。
- `src/game.ts`：`passiveList` / `evoHint` 辅助、HUD 与结算接线。
- `README.md`、`README.zh-CN.md`：特性说明更新。
- 回滚方式：回退本任务对应提交（无存档格式变更，localStorage 键未新增或改动）。

## 2026-06-30 - Task: 审查现有游戏并完成同类产品调研

### What was done

- 捕获并审查开始界面、实战 HUD、商店和阵亡结算四个关键流程状态。
- 将截图、逐步 UX/视觉/可访问性发现和证据边界整理到 Figma。
- 对标 Brotato、20 Minutes Till Dawn、Halls of Torment，形成分优先级的改进机会清单。

### Testing

- 在本地 Vite 预览中完成开始、实战、商店、阵亡流程的浏览器验收，四张截图均已打开检查。
- Figma 画布已渲染复核，四张截图按顺序摆放，逐步备注和证据边界可见。
- 调研文档中的四个 PNG 引用均指向实际存在的 1280×720 文件。

### Notes

- `docs/research/2026-06-30-product-audit/README.md`：新增现状审查、竞品调研、问题排序与机会地图。
- `docs/research/2026-06-30-product-audit/01-start.png`：新增开始界面审查截图。
- `docs/research/2026-06-30-product-audit/02-gameplay.png`：新增实战 HUD 审查截图。
- `docs/research/2026-06-30-product-audit/03-shop.png`：新增商店审查截图。
- `docs/research/2026-06-30-product-audit/04-defeat.png`：新增阵亡结算审查截图。
- `progress.md`：新增本轮调研记录。
- 回滚方式：执行 `git restore -- progress.md` 并删除 `docs/research/2026-06-30-product-audit/`；若尚未提交且 `progress.md` 为本轮新建，可一并删除该文件。

## 2026-06-30 - Task: 锁定战术伪 3D 设计方向

### What was done

- 基于用户选定的第 1 套视觉方案，明确 UI、玩法节奏、人物动作、特效、图片资产和伪 3D 渲染边界。
- 将成功标准、代码边界、数据流、错误处理、验证范围和非目标整理为可实施设计规范。

### Testing

- 完成设计规范自检：无 `TBD`、`TODO`、占位符或未决项，章节与成功标准一致。
- 已确认规范引用的选定视觉目标文件存在并可打开，尺寸为 1664×936。
- `git diff --check` 通过。

### Notes

- `docs/design/2026-06-30-tactical-redesign/selected-direction.png`：保存用户选定的第 1 套战术清晰视觉目标。
- `docs/superpowers/specs/2026-06-30-zombie-survivor-tactical-redesign-design.md`：新增完整改造设计规范。
- `progress.md`：追加本轮设计记录。
- 回滚方式：回退本任务对应提交，或删除上述两个新增文件并将 `progress.md` 恢复到上一提交。

## 2026-06-30 - Task: 制定战术伪 3D 实施计划

### What was done

- 将已批准设计拆成 7 个可独立验证和提交的实施任务，覆盖玩法节奏、装备图片、HUD、人物动作、伪 3D、战斗反馈、浏览器验收和 GitHub 同步。
- 为每个任务明确修改范围、失败测试、最小实现、验证命令、预期结果和提交点。

### Testing

- 完成计划自检：覆盖设计规范的全部成功标准，函数名与类型签名在各任务间一致。
- 计划包含 7 个任务、41 个可勾选步骤，无 `TBD`、`TODO`、`implement later` 或未决实现描述。
- `git diff --check` 通过。

### Notes

- `docs/superpowers/plans/2026-06-30-zombie-survivor-tactical-redesign.md`：新增完整实施计划与完成证据矩阵。
- `progress.md`：追加本轮计划记录。
- 回滚方式：回退本任务对应提交，或删除计划文件并将 `progress.md` 恢复到上一提交。

## 2026-06-30 - Task: ????? 3D ??????????

### What was done

- ???????????????????????????????????????????????????????
- ??????????????? Emoji ????? 8 ???????? PNG ???????
- ?? UI ?????????? HUD???/??/???/????????????????????????/?????????
- ???????? 3D ????????????????????????????????????????????????????????????
- ???????????????????????????????????? `docs/screenshots/`??????? 1280?720 ????????????
- ???? README?????????????? HUD?????????????????????? 3D ?????

### Testing

- `npx vitest run tests/runFlow.test.ts tests/director.test.ts tests/sim.test.ts`?3 ??????11 ????????????????????????????
- `npx vitest run tests/equipment.test.ts`?5 ??????8 ??????????? 96?96 RGBA PNG?????? alpha ?????
- `npx vitest run tests/motion.test.ts tests/playerWeaponSprite.test.ts`?2 ??????5 ???????????????????????????????????
- `npm test`?11 ??????45 ????????
- `npm run build`?TypeScript `tsc --noEmit` ???Vite ????????????? 123 ????
- `git diff --check`??????????
- ??? 1280?720 ?????
  - `docs/screenshots/tactical-title.png`???????Start ?????
  - `docs/screenshots/tactical-gameplay.png`??? 00:12 ???HUD ????/??/??/??/???/HP?????? 1?
  - `docs/screenshots/tactical-shop.png`????? 8 ?????????????????? `clientHeight=462`?`scrollHeight=462`?`overflowY=hidden`??????????
  - `docs/screenshots/tactical-defeat.png`?????????????????????????????????????????
  - Console error ?????? `[]`?
- ??? 900?720 ??????`#ui-weapons` ? `display:none`?HP????????????????

### Notes

- `README.md`?????????????????????????????UI???????? 3D ???
- `README.zh-CN.md`????????????????
- `docs/screenshots/tactical-title.png`??????????????
- `docs/screenshots/tactical-gameplay.png`?????????????
- `docs/screenshots/tactical-shop.png`?????????????
- `docs/screenshots/tactical-defeat.png`???????????????
- `public/assets/ASSETS.md`???????????????
- `public/assets/manifest.json`??? 8 ???????????
- `public/assets/equip_magnet.png`????????????
- `public/assets/equip_grenade.png`????????????
- `public/assets/equip_medkit.png`???????????
- `public/assets/equip_shield.png`?????????????
- `public/assets/equip_boots.png`????????????
- `public/assets/equip_berserk.png`????????????
- `public/assets/equip_coin_double.png`????????????
- `public/assets/equip_death_dance.png`????????????
- `src/runFlow.ts`?????????????????????????
- `src/ctx.ts`???????????????????
- `src/data/equipment.ts`????????? Emoji ????????
- `src/fx/fx.ts`????????????
- `src/game.ts`???? HUD ?????????????????????????????????
- `src/render/canvas2d.ts`?????????????/???????
- `src/render/motion.ts`???????????????????????
- `src/render/renderer.ts`?????????????????
- `src/render/spriteScale.ts`?????????????????????
- `src/systems/bullets.ts`???????????????
- `src/systems/combat.ts`???????????????????/??????
- `src/systems/enemyAI.ts`?? Boss ???????????
- `src/systems/pipeline.ts`??????????
- `src/systems/player.ts`??????????????????????
- `src/systems/spawn.ts`??????????????
- `src/ui/ui.ts`????? HUD???????????????????? 1280?720 ??????
- `tests/equipment.test.ts`??????????????
- `tests/motion.test.ts`?????????????????
- `tests/runFlow.test.ts`???????????????
- `progress.md`????????????????????
- ?????????? `783f85b`??????? `55de10e` ??????????????????????? `git restore README.md README.zh-CN.md progress.md` ??? `docs/screenshots/tactical-*.png`?

## 2026-06-30 - Task: ???????????? 3D ??

### What was done

- ??????????????????????????????????????? bob ??????????????
- ?????????/??????????????????????????????????????? 2.5D ??????????????????????
- ??? 3D ???????????????????/???????????????????????????????
- ????????????????????????????????????????

### Testing

- `npx vitest run tests/heldGear.test.ts`?4 ??????????????/????????????????????????
- `npx vitest run tests/heldGear.test.ts tests/motion.test.ts tests/playerWeaponSprite.test.ts`?3 ??????9 ???????????????????????????????
- `npm run typecheck`?TypeScript ???????
- `npm test`?12 ??????49 ????????
- `npm run build`???????????? 123 ????
- `git diff --check`??????????
- ??? 1280?720 ?????`docs/screenshots/held-gear-gameplay.png` ?????????console error ???`docs/screenshots/held-gear-closeup.png` ??????????????????????? 3D ???

### Notes

- `README.md`??????????????????????????
- `README.zh-CN.md`??????????
- `docs/screenshots/held-gear-gameplay.png`????????????????
- `docs/screenshots/held-gear-closeup.png`????????????????
- `src/render/heldGear.ts`???????????????????????????
- `src/game.ts`???????????????????????????????
- `tests/heldGear.test.ts`??????????????
- `progress.md`????????????????
- ?????????????????? `git restore README.md README.zh-CN.md progress.md src/game.ts`???? `src/render/heldGear.ts`?`tests/heldGear.test.ts`?`docs/screenshots/held-gear-*.png`?


## 2026-06-30 - Task: ??????????????????

### What was done

- ????????????????????????????????????????????????????????????
- ????????????????????????? HUD?????????????????????
- ????????????????????????????????????????????????
- ?????? 1280?720 ????????????????????? QA ???

### Testing

- TDD RED?`npx vitest run tests/weapons.test.ts` ????????????? `y = 0`??????????? `y < -36`?
- TDD GREEN?`npx vitest run tests/weapons.test.ts tests/combatActor.test.ts` ???2 ???? 8 ??????????????????????????????????
- `npm test`?12 ?????? 50 ????????
- `npm run typecheck`?TypeScript ???????
- `npm run build`?Vite ?????????? 123 ????
- `git diff --check`???????????? Windows ?????
- ????????????? 1024?1024 RGBA???????????????????
- ??????1280?720 ????????`docs/screenshots/integrated-combat-closeup.png` ?????????????????????????????????? `favicon.ico` 404?

### Notes

- `README.md`?????????????????????????
- `README.zh-CN.md`??????????
- `design-qa.md`??????????????????????????
- `docs/references/target-pseudo3d-combat.png`????????? 3D ??????
- `docs/screenshots/integrated-combat-gameplay.png`??? 1280?720 ??????????
- `docs/screenshots/integrated-combat-closeup.png`????????????????????
- `docs/screenshots/integrated-combat-comparison.png`?????????????????
- `docs/superpowers/specs/2026-06-30-integrated-combat-character-design.md`?????????? 3D ????????
- `docs/superpowers/plans/2026-06-30-integrated-combat-character.md`??? TDD????????????? QA ?????
- `public/assets/ASSETS.md`?????????????????
- `public/assets/manifest.json`?????????????
- `public/assets/player_pistol.png`???????????????
- `public/assets/player_shotgun.png`????????????????
- `public/assets/player_smg.png`????????????????
- `public/assets/player_magnum.png`????????????????
- `src/render/combatActor.ts`???????????????????????????
- `src/render/heldGear.ts`?????????????????????
- `src/game.ts`??????????????????????????
- `src/systems/weapons.ts`????????????????????????
- `tests/combatActor.test.ts`????????????????????
- `tests/heldGear.test.ts`??????????????
- `tests/weapons.test.ts`????????????????????????????
- `progress.md`?????????????????????
- ???? `ab3bd1a`????????????????????? `git diff --binary ab3bd1a HEAD | git apply -R`???? `npm test` ? `npm run build` ???????


## 2026-07-01 - Task: ???????????????

### What was done

- ???????????????????????????????????????????????????????
- ????????????????????????????????????????????????????????
- ????? README ?????????????? `docs/` ????????????????

### Testing

- `npm test`?12 ?????? 50 ????????
- `npm run build`?TypeScript ? Vite ?????????? 123 ?????????????? `dist/`?
- `git diff --check`???????????? Windows ?????
- `Select-String -Path README.md,README.zh-CN.md -Pattern 'docs/screenshots|design-qa'`?????README ?????????? QA ???
- ???????`.playwright-cli/`?`output/`?`dist/`?`.wrangler/`?`dev-server.log` ? `dev-server.err.log` ?????

### Notes

- `README.md`????????????????
- `README.zh-CN.md`??????? README ???????
- `design-qa.md`?????????????
- `docs/README.md`?????????????????????????
- `docs/design/2026-06-30-tactical-redesign/selected-direction.png`???????????
- `docs/references/target-pseudo3d-combat.png`????????????
- `docs/research/2026-06-30-product-audit/01-start.png`???????????
- `docs/research/2026-06-30-product-audit/02-gameplay.png`??????????
- `docs/research/2026-06-30-product-audit/03-shop.png`??????????
- `docs/research/2026-06-30-product-audit/04-defeat.png`??????????
- `docs/research/2026-06-30-product-audit/README.md`??????????????????
- `docs/screenshots/gameplay-hero.jpg`??????????
- `docs/screenshots/held-gear-closeup.png`???????????
- `docs/screenshots/held-gear-gameplay.png`???????????
- `docs/screenshots/integrated-combat-closeup.png`??????????????
- `docs/screenshots/integrated-combat-comparison.png`????????????
- `docs/screenshots/integrated-combat-gameplay.png`????????????
- `docs/screenshots/tactical-defeat.png`???????????
- `docs/screenshots/tactical-gameplay.png`??????????
- `docs/screenshots/tactical-shop.png`??????????
- `docs/screenshots/tactical-title.png`???????????
- `docs/superpowers/plans/2026-06-30-integrated-combat-character.md`???????????????
- `docs/superpowers/plans/2026-06-30-zombie-survivor-tactical-redesign.md`??????????????
- `docs/superpowers/specs/2026-06-30-integrated-combat-character-design.md`????????????????
- `docs/superpowers/specs/2026-06-30-zombie-survivor-tactical-redesign-design.md`???????????????
- `.playwright-cli/`?????????????????????????
- `output/`????????Figma ???????????
- `dist/`??????????????
- `.wrangler/`??????????????
- `dev-server.log`?`dev-server.err.log`?????????????
- `progress.md`?????????????????????????
- ???? `d4a2186`??????????????? `git diff --binary d4a2186 HEAD | git apply -R`???? `npm test` ? `npm run build` ???????

## 2026-07-05 - Task: Add generated poster to GitHub repository introduction
### What was done
- Added the generated Zombie Survivor poster as the repository introduction hero artwork.
- Embedded the poster near the top of both English and Simplified Chinese README files so GitHub visitors see the visual identity before the play link.

### Testing
- Ran a Python validation that opened `docs/images/zombie-survivor-poster.png` with PIL, confirmed it is a PNG at `941x1672`, confirmed both README files reference `docs/images/zombie-survivor-poster.png`, and confirmed each referenced image path exists.
- Confirmed the Simplified Chinese README image alt text remains valid UTF-8 text after fixing a command-line encoding issue.

### Notes
- `docs/images/zombie-survivor-poster.png`: Added the generated poster image for README/GitHub display.
- `README.md`: Embedded the poster as a centered hero image above the play link.
- `README.zh-CN.md`: Embedded the same poster with Chinese alt text above the play link.
- `progress.md`: Appended this task record, validation evidence, and rollback guidance.
- Rollback: remove `docs/images/zombie-survivor-poster.png`, delete the inserted `<p align="center">...poster...</p>` block from both README files, and remove this appended progress entry; alternatively run `git checkout -- README.md README.zh-CN.md progress.md` and delete `docs/images/zombie-survivor-poster.png` before committing.

## 2026-07-05 - Task: Point GitHub play link to Cloudflare Pages
### What was done
- Recreated the game on Cloudflare Pages under the `zombie-survivor` project and verified the production URL `https://zombie-survivor.pages.dev/` returns the game HTML.
- Updated the English and Simplified Chinese README play links from the failing Workers URL to the verified Pages URL.
- Changed the Wrangler config from Workers static assets to Cloudflare Pages output configuration to avoid future deployment confusion.

### Testing
- Ran `npm run build` successfully.
- Verified `https://zombie-survivor.pages.dev/` returns `HTTP/1.1 200 OK` and the HTML title `末日清道夫 · Zombie Survivor`.
- Verified `README.md` and `README.zh-CN.md` contain `https://zombie-survivor.pages.dev/` and no longer contain `workers.dev`.
- Verified `wrangler.jsonc` contains `pages_build_output_dir` and no longer contains the Workers `assets` config.

### Notes
- `README.md`: Changed the `Play Now` link to the Cloudflare Pages production URL.
- `README.zh-CN.md`: Changed the `立即游玩` link to the Cloudflare Pages production URL.
- `wrangler.jsonc`: Replaced the Workers static-assets deployment config with Cloudflare Pages output config.
- `progress.md`: Appended this task record, validation evidence, and rollback guidance.
- Rollback: restore the previous README links and Wrangler config from Git, then optionally remove the Cloudflare Pages project or deploy a corrected target; for local rollback before commit, run `git checkout -- README.md README.zh-CN.md wrangler.jsonc progress.md`.

## 2026-07-26 - Task: 可玩性大版本——连击、精英、空投、血月、新武器、干员与无尽模式

### What was done

- 调研 Vampire Survivors / Brotato / 20 Minutes Till Dawn / Halls of Torment / DRG:S 等同类游戏的留存与爽感机制，按"实现成本 vs 收益"排序后落地本轮改造。
- 新增击杀连击系统：4 秒窗口内连杀升档（连击/杀戮/狂热/灭世），放大经验与金币；受到真实伤害断链，护盾挡下不断链；HUD 右侧连击计数器 + 高档位屏幕狂热光效。
- 新增精英词缀怪：迅捷/巨力/剧毒三系，50 秒后按递增概率出场，属性成倍、奖励数倍，剧毒死亡释放环形酸液；渲染带彩色地面光环与近距名牌。
- 新增空投补给：42 秒节奏伞降补给箱（降落伞动画+落地光柱），近身开箱六选一加权奖励（金币/全场磁吸/医疗/弹药 buff/武器升级/护盾电池），带 HUD 播报 toast。
- 新增血月尸潮事件：95s/165s 两场脚本风暴 + 300s 起每 150s 循环（覆盖无尽模式），预警横幅→红幕边缘光→刷怪 ×2.3、敌速 +12%、金币 +60%。
- 新增黄金逃亡者：70s 起每 65s 一只金色目标全速逃逸（带蛇形走位与消失前闪烁），限时击杀掉落金币喷泉。
- 新增两把武器及进化：火焰喷射器/地狱吐息（近距火舌、火焰粒子弹道、静默伤害数字防刷屏）与火箭筒/集束火箭（命中溅射爆炸，对玩家无伤）。
- 新增干员选择：游侠(+攻速/手枪)、重装(+40HP/-8%移速/霰弹)、猎手(+15%暴击/+8%移速/-20HP/马格南)，标题界面卡片选人并记忆上次选择。
- 新增无尽模式：胜利结算可一键续战，暴君每 110 秒回归且血量按 1.45^n 递增，击杀奖励金币与治疗；威胁栏、结算统计（最高连击/精英击破/空投回收/额外暴君）同步扩展。
- 伤害数字按伤害量分级缩放，暴击更大带感叹号；升级/商店卡片沿用统一视觉；两枚新武器图标（火焰/火箭）用 pngjs 程序化生成 96×96 扁平风格。

### Testing

- `npm test`：19 个测试文件 85 个测试全部通过（新增 combo/elites/supply/surge/operatives/newWeapons/endless 七个测试文件与共享 helpers）。
- `npm run build`：TypeScript `tsc --noEmit` 通过，Vite 产线构建成功（127 模块）。
- 浏览器实测（Vite dev + JS 驱动逐帧模拟）：干员属性与起手武器正确；35s 空投伞降→落地→拾取→"军费储备 获得44金币"toast 全链路；70s 金色逃亡者出场；95s "血月将至"预警→"血月尸潮"横幅→14 秒内连击冲至 112(灭世档)、金币 461→914；精英光环/名牌渲染正确且已加"仅玩家 340px 内显示名牌"防噪；240s Boss 登场→胜利结算含全部新统计与"无尽尸潮 (E)"按钮→进入无尽后 110s 暴君二号准时回归且血量 7540=5200×1.45；全程 console 零报错。
- Canvas 截图验收两张（火焰喷射+精英群战、血月红幕+暴君弹幕），确认特效可读性后做了名牌距离裁剪与血月红光增强两处视觉修正。

### Notes

- `src/data/balance.ts`：连击档位、血月窗口(含无尽循环)、空投节奏、精英概率、无尽 Boss 参数。
- `src/data/elites.ts`、`src/data/operatives.ts`：新增词缀表与干员表。
- `src/data/weapons.ts`、`src/data/enemies.ts`、`src/data/schemas.ts`：新武器/金色逃亡者/schema 扩展（bulletStyle、explodeRadius、OperativeDef、golden 行为）。
- `src/systems/combo.ts`、`src/systems/supply.ts`：新增系统；`pipeline.ts` 接入。
- `src/systems/combat.ts`：连击挂钩、精英与金色奖励、血月金币、可选不伤玩家的爆炸、无尽 Boss 击杀分支。
- `src/systems/spawn.ts`：精英掷骰、血月刷怪倍率、金色节奏（计入怪物上限）、无尽暴君循环。
- `src/systems/enemyAI.ts`、`bullets.ts`、`player.ts`、`equipment.ts`：精英/血月速度、金色逃逸 AI、火箭溅射、火焰静默数字、连击经验倍率、supplyAmmo buff。
- `src/game.ts`、`src/ui/ui.ts`、`src/render/canvas2d.ts`、`renderer.ts`、`src/fx/fx.ts`：干员选人标题界面、连击部件、血月横幅、空投 toast、结算新统计与无尽按钮、精英光环名牌、空投伞降/光柱渲染、火焰/火箭弹道渲染、drawEdgeGlow、伤害数字缩放。
- `src/factory.ts`、`src/components/index.ts`、`src/ctx.ts`、`src/sim/headless.ts`：SupplyCrate 组件、精英生成、RunState(连击/统计) 等基建。
- `public/assets/flamer.png`、`public/assets/rocket.png`、`manifest.json`、`ASSETS.md`：新图标与注册。
- `src/main.ts`：新增 DEV-only `window.__zs` QA 钩子与 `Game.debugSkip`。
- `tests/`：helpers.ts + 7 个新测试文件；6 个既有测试的 ctx 构造补 `run` 字段。
- `README.md`、`README.zh-CN.md`：特性、敌人表、操作表、目录结构更新。
- 回滚方式：回退本任务对应提交（git revert 或 reset 到前一提交），无数据迁移。

## 2026-07-26 - Task: 留存与爽感迭代——成就、血怨祭坛、肾上腺素、开箱演出、连击音调、暂停

### What was done

- 新增 20 项成就系统：单局目标（击杀/连击/精英/空投/零接触/进化/血怨/无尽暴君等）+ 累计目标（总击杀/总局数/总胜场），检查为纯函数快照评估；局内每 0.75s 实时解锁并弹青色 toast，localStorage 持久化（zs-ach / zs-life），无尽模式下按增量提交避免重复计数；标题页成就墙（20 格勾选态）、结算页展示本局新解锁徽章与总进度。
- 新增血怨祭坛（风险旋钮）：阶段 2 起每次进阶升起一座黑曜石碑（红光+脉冲环+名牌），踏入立约消耗祭坛并叠层——每层刷怪 +15%、精英率 +3%，换经验 +20%、金币 +10%，红色 toast 播报当前总加成。
- 新增肾上腺素爆发：血量首次跌破 20% 自动触发（每局一次）：+15 生命、1.5s 无敌、220px 击退波与金色特效，把濒死转为高光；对致命一击不触发。
- 空投开箱从底部 toast 升级为中央揭示卡（弹跳缩放动画+金色辉光，1.9s 自动淡出，不暂停游戏）。
- 击杀音效接入连击音调阶梯：pitch = 1 + min(0.6, 连击数×0.006)，采样与合成两条路径都支持变调。
- 新增暂停：游玩中 Esc/P 暂停（含继续/重新出击按钮），Esc/P/Space 恢复。
- 标题界面新增"成就 X/20"入口与 Esc 暂停提示；操作表/特性说明双语同步。

### Testing

- `npm test`：22 个测试文件 97 个测试全部通过（新增 achievements/curse/adrenaline 三个测试文件）。
- `npm run build`：TypeScript 与 Vite 产线构建通过（127 模块）。
- 浏览器实测（Vite dev + JS 驱动）：成就墙 20 格开合正常；40s 后"猎杀新手"实时解锁（青色 toast + zs-ach 落库）；空投揭示卡"武器改装件"中央弹出；祭坛触碰→"血怨诅咒 ×1"红色 toast + curse=1；Esc 暂停→"已暂停"面板→Esc 恢复；30HP 吃 15 伤→肾上腺素触发（回到 30HP、无敌 1.5s、toast），二次受击不再触发；阵亡结算显示"✓ 猎杀新手"徽章与"总进度 1/20"，zs-life 记录 {kills:92,runs:1,wins:0}；全程 console 零报错。
- Canvas 截图验收祭坛渲染（石碑/红光/名牌可读）。
- 因 5173 被占用，`.claude/launch.json` 开启 autoPort（vite.config 已支持 PORT 环境变量）。

### Notes

- `src/data/achievements.ts`：成就定义 + evaluateAchievements 纯函数。
- `src/systems/curse.ts`：祭坛生成/触碰/四组乘数；`runFlow.ts` 阶段进阶时升起祭坛；`spawn.ts` 刷怪与精英率吃诅咒；`player.ts` 经验、`combat.ts` 金币吃诅咒。
- `src/systems/combat.ts`：肾上腺素爆发、firstHpHitAt 记录、金色击杀计数、击杀音调；`combo.ts` comboPitch + RunState 新字段；`audio/audio.ts` sample/tone 变调。
- `src/progression.ts`：武器进化标记 run.evolved。
- `src/game.ts`：成就快照/实时检查/增量生命周期提交、暂停状态机、onAnnounce 接线、祭坛渲染分支、结算新字段。
- `src/ui/ui.ts`：成就墙、结算成就徽章、toast 变体（金/红/青）、中央揭示卡、暂停面板、标题成就入口。
- `src/ctx.ts`、`src/components/index.ts`：RunState 扩展（goldenKilled/evolved/firstHpHitAt/adrenalineUsed/curse）、CurseAltar 组件、onAnnounce hook。
- `tests/achievements.test.ts`、`tests/curse.test.ts`、`tests/adrenaline.test.ts`：新增。
- `README.md`、`README.zh-CN.md`：特性与操作表更新。
- 回滚方式：回退本任务对应提交；本地存档键 zs-ach/zs-life 可手动清除。

## 2026-07-26 - Task: 干员升级(老兵系统)与救援幸存者僚机系统

### What was done

- 干员升级(跨局元进程)：每局按 击杀×0.5 + 生存秒×0.25 + 精英×2 + 无尽暴君×40 + 胜利120 结算经验(zs-ops 持久化,无尽二次结算按增量入账)；等级上限 Lv.10,每级强化各干员招牌属性(游侠 +2% 攻速/级、重装 +6 生命/级、猎手 +1.2% 暴击/级)；开局自动套用老兵加成;标题卡显示等级徽章、经验条与当前加成,结算页显示"经验 +X · Lv.Y (▲升级)"。
- 救援幸存者僚机系统：55s 起每 75s 在小队未满(上限 2)时出现被困幸存者(白色求救光标+耐心倒计时环,15s 未达则离开)；近身 42px 救援入队,三种僚机随机——机枪手(380px 速射)、火焰兵(近距三股火舌)、军医(4.5s 一跳 +3 治疗)；僚机沿玩家身后双槽位漂移跟随(48px),伤害随局时缓增,承受尸潮接触伤害(减半+0.7s 无敌帧)并可阵亡(红色播报),阵亡后新幸存者继续刷新。
- HUD 左侧小队栏(彩点+名称+实时血条)、场上僚机头顶职业光标与血条、幸存者救援倒计时标签;结算页新增"救援幸存者"统计。
- 新增成就 2 项(不抛弃/完整编队),成就总数 22;快照加入 rescued 与 squadNow 字段。

### Testing

- `npm test`：24 个测试文件 111 个测试全部通过(新增 opLevel 6 项、wingman 8 项)。
- `npm run build`：TypeScript 与 Vite 构建通过(131 模块)。
- 浏览器实测(Vite dev + JS 驱动)：标题卡三张 Lv.1 徽章与"距下级 100 XP"正确;55s 军医出现→近身入队(toast+小队栏芯片+rescued=1);军医无干扰治疗 +3/4.5s;跟随距离恰为槽位 48px;130s 第二名(机枪手)入队→"不抛弃""完整编队"两成就解锁落库;阵亡结算"游侠 经验 +47 · Lv.1"且 zs-ops={"ranger":47};将 ranger XP 拉到 500(Lv.4)重开→fireRateMul=1.18(=1+0.12+0.02×3)精确生效;全程 console 零报错。
- Canvas 截图验收小队在尸潮中的渲染(军医血条/阵型/彩色标识可见)。

### Notes

- `src/data/operatives.ts`：levelPerk 数据 + OP_LEVEL_CAP/opXpToNext/opLevelFromXp/opXpGain/applyOperativeLevel/opLevelBonusText;`schemas.ts` OperativeDefSchema 增加 levelPerk。
- `src/data/wingmen.ts`：三种僚机定义与节奏常量;`components` 新增 Survivor/Wingman;`factory` spawnSurvivor/spawnWingman。
- `src/systems/wingman.ts`：幸存者刷新/超时/救援、槽位跟随、接触损血与阵亡、机枪/火焰/治疗行为;`pipeline` 注册于 enemyAI 之后。
- `src/game.ts`：干员经验增量结算(commitLifetime)、开局套用等级、标题进度注入、快照 rescued/squadNow、幸存者与僚机世界渲染、HUD squad 数据。
- `src/ui/ui.ts`：标题卡等级块、#ui-squad 小队栏、结算 op-line 与救援统计;`ctx.ts` RunState.rescued + Director.nextSurvivorAt。
- `src/data/achievements.ts`：rescue-1/squad-2 成就与快照字段。
- `tests/opLevel.test.ts`、`tests/wingman.test.ts`：新增;`tests/achievements.test.ts` 快照补字段。
- `README.md`、`README.zh-CN.md`：新特性说明。
- 回滚方式：回退本任务对应提交;本地存档键 zs-ops 可手动清除。
