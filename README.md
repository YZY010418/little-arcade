# 玩一会儿 · Little Arcade

一个打开就能玩的在线小游戏平台，用游戏预览、简单介绍和统一返回入口，让玩家轻松发现和切换游戏。

[在线游玩](https://yzy010418.github.io/little-arcade/)

当前游戏：

- **纸上幸存者**：涂鸦风格自动攻击生存游戏，经典闯关、无尽模式、升级技能与成就手册。
- **魔塔 · 50 层**：经典数值策略冒险，包含塔外及 50 层地图、剧情、道具、商店、存读档。
- **最后一炉火**：雪原经营生存冒险，自动采集与战斗、熔炉升级、供热塔修复和最后风暴。扩展暖域，让春天重返小镇，支持本地续玩。

## 本地运行

不需要安装 npm 依赖或构建。

```sh
python3 -m http.server 4175 --directory site
```

打开 `http://localhost:4175`。点击游戏预览或开始按钮进入游戏，使用游戏页顶部的“返回游戏库”重新挑选。具体操作与进度保存规则以各游戏内的说明为准。

存档只在当前浏览器与域名保存，旧网站或本地预览的进度不会自动迁移到 GitHub Pages。

## GitHub Pages

仓库的 `.github/workflows/pages.yml` 在推送到 `main` 时检查并发布 `site/`。仓库 Settings → Pages → Source 选择 **GitHub Actions**。

所有站点资源都使用相对路径，兼容 GitHub Pages 的仓库子目录。`.nojekyll` 保留魔塔使用的下划线资源文件。

## 检查与维护

```sh
node tests/check-site.mjs
node tests/last-ember.test.cjs
node tests/last-ember-playthrough.cjs
node --check site/player.js
```

检查入口、相对链接、引擎声明的资源、51 层地图和打包地图的一致性。游戏预览采用 SVG 插图。安装 Pillow 后可通过 `python3 scripts/build_previews.py` 重新生成前两款游戏的预览；最后一炉火的插图保存在 `site/previews/last-ember.svg`。

《最后一炉火》的引擎测试覆盖资源与升级、采集卸货、熄火恢复、受伤救援、存档校验和最终兽潮。通关模拟仅通过正常移动与操作采集、建设、战斗，不注入资源；可在命令后追加随机种子，例如 `node tests/last-ember-playthrough.cjs 42`。这些检查不替代浏览器中的画面和输入测试。

```text
site/
  index.html             游戏总览
  play.html              游戏页与返回导航
  previews/              游戏预览图
  games/paper-survivor/   纸上幸存者
  games/magic-tower/      魔塔界面、地图、引擎及素材
  games/last-ember/       雪原经营生存游戏
```

## 来源

纸上幸存者、最后一炉火与合集界面为本项目代码。最后一炉火的画面由 Canvas 实时绘制，音效由 Web Audio 合成，无需外部素材或网络依赖。魔塔使用用户提供的像素素材，基于三原塔翻新小组的 [50 层魔塔复刻](https://h5mota.com/tower/?name=51)，运行引擎为 [ckcz123/mota-js](https://github.com/ckcz123/mota-js)。引擎保留 BSD-3-Clause 许可。

魔塔的地图、剧情、音频及其他第三方素材保留各自作者权利，不能将引擎许可视为全部内容的许可。详细来源与历史署名见 [SOURCES.txt](site/games/magic-tower/game/SOURCES.txt) 和 [引擎许可](site/games/magic-tower/game/LICENSE-engine.md)。
