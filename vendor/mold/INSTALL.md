# 🧑‍💻 零基础安装指南（Windows / Mac）

> 这一页写给**完全没接触过代码**的朋友：不知道 GitHub 是什么、没用过"终端"也没关系，照着做，十几分钟能跑起来。已经会用命令行的，直接看 [README 的一行命令安装](README.md#-安装跨-agent)。
>
> *This is a zero-basics, step-by-step install guide in Chinese. English speakers: see [README → Install](README.md#-install-cross-agent).*

先说清楚三件事：

1. **你现在看的这个网站就是 GitHub**（一个放开源代码的网站），本项目地址是 `github.com/zexuanw958-svg/travel-plan-viz`——不用去百度/应用商店搜。
2. 这是一个给**电脑上的 AI 助手**（Claude Code / Codex）用的"技能包"，**不是手机 App**，手机上装不了；但做出来的旅行网页发到手机上随时看。
3. 全程只需要**复制、粘贴、回车**，不用写任何代码。

---

## 第 0 步 · 你需要什么

- 一台电脑：Windows 10/11 或 Mac 都行（**Windows 完全支持**，下面每步都有 Windows 版）。
- 一个 Claude 账号：Claude Code 是 Anthropic 官方的 AI 助手，需要 Claude 订阅（Pro 起）或按 API 用量付费。账号注册与各地区可用性以 [Anthropic 官方](https://claude.com/claude-code)说明为准。
- 用 OpenAI Codex 的朋友：步骤几乎一样，见文末[常见问题](#常见问题)。

## 第 1 步 · 安装 Claude Code（AI 助手本体）

Claude Code 跑在"终端"里——就是那个输文字命令的窗口。别怕，你只需要粘贴一行命令：

**Windows：**

1. 点开始菜单，搜「**PowerShell**」，打开它（一个蓝色/黑色窗口）。
2. 复制下面这行，粘贴进去，按回车，等它装完：

```powershell
irm https://claude.ai/install.ps1 | iex
```

**Mac：**

1. 按 `Command + 空格`，搜「**终端**」（Terminal），打开它。
2. 复制下面这行，粘贴进去，按回车，等它装完：

```bash
curl -fsSL https://claude.ai/install.sh | bash
```

装完后，在同一个窗口输入 `claude` 回车。**第一次会让你登录 Claude 账号**，照屏幕提示操作即可。能看到 Claude 的对话界面，这一步就成了（先输入 `/exit` 退出，继续下一步）。

## 第 2 步 · 下载本技能包

不需要懂 git：

1. 回到本项目的 GitHub 页面，点**绿色的「Code」按钮** → 点「**Download ZIP**」。
2. 解压下载的 zip（Windows：右键 → 全部提取；Mac：双击）。
3. 解压出来的文件夹里，有一个叫 **`travel-plan-viz`** 的子文件夹——它就是技能包本体，下一步只搬它。

## 第 3 步 · 把技能包放进 Claude 的技能目录

**Windows（用文件资源管理器）：**

1. 打开文件资源管理器，在**地址栏**输入 `%USERPROFILE%\.claude` 回车（这个文件夹在你第一次运行 `claude` 后就会存在）。
2. 里面如果没有 `skills` 文件夹，就右键新建一个。
3. 把第 2 步解压出来的 `travel-plan-viz` **整个文件夹**复制进 `skills` 里。

最终路径长这样：`C:\Users\你的用户名\.claude\skills\travel-plan-viz`

**Mac（用访达）：**

1. 打开访达，按 `Command + Shift + G`，输入 `~/.claude` 回车。
2. 里面如果没有 `skills` 文件夹，就新建一个。
3. 把 `travel-plan-viz` 整个文件夹拖进 `skills` 里。

最终路径长这样：`~/.claude/skills/travel-plan-viz`

**自查一下**：打开 `skills/travel-plan-viz/`，里面应该**直接**能看到 `SKILL.md` 这个文件。如果还得再点一层 `travel-plan-viz` 才看到，说明你复制的是外面那层文件夹——进去把里层的搬出来替换即可。

## 第 4 步 · 开始用（装完说这句话）

1. 打开终端 / PowerShell，输入 `claude` 回车。
2. 直接说：

```
帮我做香港 4 天 3 晚的旅行计划
```

或者你已有计划：

```
这是我的行程：第一天……第二天……，帮我做成网页
```

3. 它会联网调研、排行程（需要几分钟），中间弹出"是否允许联网搜索"等权限询问，**允许**即可。
4. 做完它会告诉你生成的 `.html` 文件在哪——**双击用浏览器打开**就是成品；把这个文件发到手机（微信文件传输助手/AirDrop 都行），路上随时看，文字行程没网也能读。

## 常见问题

**Windows 能装吗？**
能。Claude Code 原生支持 Windows，上面每一步都给了 Windows 路径。

**要花钱吗？**
本技能包免费开源（MIT 协议）。但 Claude Code 本体需要 Claude 订阅（Pro 起）或 API 按量计费，以 Anthropic 官方定价为准。

**手机上（抖音/皮皮虾）能装吗？**
不能。它是给电脑上 AI 助手用的技能包，制作过程需要电脑；做好的网页文件传到手机就能看。

**我用的是 OpenAI Codex？**
第 3 步把 `travel-plan-viz` 文件夹复制到 `~/.codex/skills/`（Windows：`%USERPROFILE%\.codex\skills`）即可，其余步骤相同。其他 AI 助手的适配方法见 [`travel-plan-viz/references/porting-to-other-agents.md`](travel-plan-viz/references/porting-to-other-agents.md)。

**以后怎么更新？**
重新下载 ZIP，把 `skills` 里旧的 `travel-plan-viz` 文件夹整个替换掉。会用 git 的朋友建议直接 `git clone` 本仓库，再按 [README](README.md#-安装跨-agent) 用软链接安装，之后 `git pull` 即可更新。

**生成的信息准吗？**
页面里所有信息（价格、营业时间、班次等）都是 AI 整理的**参考**，可能过时——出发前请在官方渠道核实，页面里也有同样的提醒。
