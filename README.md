# Codex-dafeiyu 🐟

## 我们codex用户也要有自己的大肥鱼！

一只赖在 Windows 桌面上不走的蓝色大肥鱼：陪你工作、帮你看 Codex 额度，忙起来跟着冒泡思考，闲下来玩魔方、吃零食、碎碎念；也可以用当前 Codex 账号和她聊两句。

**这是基于 [dsh-pet](https://github.com/PC2005-cloud/dsh-pet) 与 [GPT-Niang](https://github.com/T7moris/GPT-Niang) 魔改的 Codex 独立桌宠。感谢两个项目的作者和贡献者！** dsh-pet 提供桌宠框架、角色与动画，GPT-Niang 提供 Codex 额度读取实现。没有这些开源工作，就没有这只 Codex 大肥鱼。

<p align="center"><img src="docs/salute.gif" width="320" alt="大肥鱼收到敬礼动画"></p>

这是社区二次开发项目，使用 GPT 模型；与 OpenAI、DeepSeek 及上游项目均无官方隶属关系。

## 有什么好玩的

| 功能 | 行为 |
| --- | --- |
| 透明动画桌宠 | 107 个 WebM 动画，点击反馈、拖拽甩抛、屏幕漫游、右键点播 |
| Codex 额度 | 按账号实际返回的窗口显示剩余额度与重置时间，每 5 分钟刷新；六档钱袋动画 |
| 工作状态 | 根据本地任务记录显示思考、写文件、搜索、执行命令、等待确认、完成和失败等状态 |
| 本地碎碎念 | 空闲时每 10 分钟说一句，也可手动触发；不调用模型 |
| 和本鱼聊天 | 当前账号可用模型、多会话历史、逐字显示；只有主动发送才调用模型 |
| 个人画像 | 可选关联 Codex 已记录的个人信息与偏好，可预览、补充、关闭 |
| 重置小雷达 | 手动查询第三方监测站，区分有效预告、暂无信号与网络失败 |
| 管理窗口与托盘 | 查看额度、聊天、显示/隐藏、修改语录与配置；关闭窗口后留在托盘 |
| 打开 Codex | 敬礼动画与气泡，尝试恢复已运行窗口或启动已安装的 Codex |
| 全屏保护 | 前台应用全屏时隐藏桌宠，退出全屏后恢复，避免自动抢焦点 |

## 下载与使用

到 [Releases](https://github.com/bianbian-666/Codex-dafeiyu/releases) 下载 Windows x64 便携包，**完整解压**到一个准备长期保留的目录，然后双击 `Codex-dafeiyu.exe`。发布包包含 Node.js、Electron 和动画，无需另外安装 Node.js、DSH 或 Python。

- 系统范围：Windows 10/11 x64。当前没有经过验证的 macOS、Linux 或 Windows ARM64 安装包。
- 看额度、聊天、工作状态需要本机安装 Codex，并使用 ChatGPT 账号登录。额度窗口与模型由账号和 Codex 接口决定。
- 未安装或未登录 Codex 时，本地动画、拖拽、语录和配置仍可使用；联网功能会说明失败原因。
- 初次启动会在 `%APPDATA%\CodexPet\data` 创建默认配置。升级时保留此目录，退出旧版后再解压新版。
- 没有开机自启。通过托盘菜单或管理窗口里的“退出软件”结束程序。
- GitHub 自动生成的 `Source code` 压缩包是源码，需要按下面的开发步骤构建。

详细操作与数据位置见 [使用说明](docs/使用说明.md)，兼容性与验证范围见 [兼容性说明](docs/兼容性与验证.md)。

## 聊天模型

新用户默认选择“自动：当前账号推荐模型 · low”，从 `model/list` 返回的可见模型中选取支持 `low` 的默认模型；没有这样的默认项时使用首个支持 `low` 的模型，不写死特定版本名。

仍可手动选择最低可用版本 Sol / Luna · low，已有用户的选择会保留。账号不提供该系列时会明确报错，不会偷偷换模型重发消息。模型错误、网络失败和额度不足也不会自动重发聊天。

## 数据与隐私

- 额度查询移植自 GPT-Niang，通过本机 Codex App Server 的只读 `account/read`、`account/rateLimits/read` 查询；不为查看额度创建聊天。
- 工作状态只读本地 `thread_history_1.sqlite`，输出通用状态，不输出聊天正文、文件名或命令内容。无数据库或不兼容的数据库结构会降级，不影响本地桌宠。
- 聊天记录与用户补充的画像保存在本机。启用画像时，主动聊天会将预览中的摘要与最近最多 3 轮对话一起发送给 Codex 服务；可随时关闭。
- 自动关联仅读取 `CODEX_HOME/memories/memory_summary.md` 中的个人信息、偏好和当前项目栏目，最多 4500 字；不扫描完整聊天记录，不改写 Codex 原始记忆。
- 本地碎碎念不联网。手动重置查询访问 [codex-reset.com](https://codex-reset.com/zh/)，该站的预计时间不保证额度实际到账。
- 没有本项目的云服务器或遥测上传。软件使用本机随机端口，管理接口带每次启动生成的访问令牌。
- 源码与发布包不包含作者的账号、聊天、Codex 记忆、日志或个人运行配置。

## 从源码构建

在 Windows x64 上安装 Node.js 24 LTS 或更新版本，然后运行：

```powershell
git clone https://github.com/bianbian-666/Codex-dafeiyu.git
cd Codex-dafeiyu
npm ci --ignore-scripts=false
npm --prefix backend ci --legacy-peer-deps --ignore-scripts
npm run build
npm test
npm run test:backend
npm run package:win
```

打包结果位于 `dist/Codex-dafeiyu-v<版本>-windows-x64/`。打包时使用当前运行的 Windows x64 Node.js，Electron 版本由根目录锁文件固定，并调用 Windows .NET Framework 自带的 C# 编译器生成桌面桥接程序。

`backend` 保留 dsh-pet 原有的插件与素材结构。这里使用独立入口及替身，不需要安装 DSH；`--legacy-peer-deps` 用于避免安装上游插件模式的 DSH 宿主依赖。完整 DSH 插件类型检查不属于此独立版的发布检查。

```text
app-shell/       管理窗口、托盘、Windows 桥接与默认配置
backend/src/     修改后的桌宠与独立后台源码
backend/runtime/ Codex 聊天、额度、状态适配器与透明窗口
backend/assets/  动画、表情、字体与基础配置
scripts/         Windows 便携包构建
tests/           兼容性与便携包验证
licenses/        上游许可证
docs/            使用说明与兼容性记录
```

特殊安装可设置 `CODEX_PET_CODEX_PATH` 为真实 Codex CLI 可执行文件路径；额度与聊天共用它。旧变量 `DSH_PET_CODEX_PATH` 仍可使用。`CODEX_PET_APP_PATH` 可指定 Codex 桌面程序，用于“打开 Codex”。`CODEX_HOME` 用于自定义 Codex 数据位置。详情见兼容性说明。

## 致谢与来源

再次感谢以下项目，欢迎给原作者点一颗 Star：

- **[PC2005-cloud/dsh-pet](https://github.com/PC2005-cloud/dsh-pet)**：本项目的主要基础，提供角色、透明动画、交互物理、菜单、桌面窗口与独立运行框架。我们在此基础上适配了 Codex，增加管理窗口、聊天会话和全屏保护等功能。
- **[T7moris/GPT-Niang](https://github.com/T7moris/GPT-Niang)**：提供 Codex 登录账号额度读取、套餐与窗口解析的实现，本项目移植了其中的只读额度后端；没有使用 GPT-Niang 的白发龙娘角色素材。
- **[ERUIHNIYHBKBNF/dafeiyu-persona](https://github.com/ERUIHNIYHBKBNF/dafeiyu-persona)**：大肥鱼说话风格与角色设定的参考来源。
- Electron、Node.js 及所有相关开源依赖。

本项目保留上游 MIT 版权与许可证。代码及二次开发说明见 [LICENSE](LICENSE)，各来源与素材范围见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。上游的功能、兼容平台与更新机制不等于本修改版已经支持，请以本仓库说明为准。
