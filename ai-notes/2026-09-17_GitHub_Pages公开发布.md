# GitHub Pages 公开发布

用户明确要求上传其 GitHub 并通过 Pages 公开，覆盖此前仅本地交付的限制。账号已核实为 `blockbloomer`；目标仓库为 `blockbloomer/lp-break-even-calculator`。

- 使用公开源码仓库、main 分支与 GitHub Actions 自动部署，不引入服务器、钱包或数据库。
- Vite base 改为 `./`，确保脚本、字体与 favicon 在 GitHub Pages 的仓库子目录下正确加载，本机预览仍可用。
- `.github/workflows/pages.yml` 在部署前执行 npm ci、测试、类型检查、lint 与构建。使用 Node.js 22 与固定提交的官方 Actions；部署只申请 Pages 和 OIDC 权限，不需要自定义密钥。
- 前端“本地测算”改为“浏览器内测算”，保留全部计算口径、APR 上限和交易磨损设置。
- 凭据只由现有系统凭据助手读取并在进程内使用，没有写入项目、文档或 Git。
- 公开网址：https://blockbloomer.github.io/lp-break-even-calculator/ ，已成功上线，HTTPS 强制启用。

撤回方式：在仓库 Settings → Pages 取消发布，无需删除源码仓库。

## 发布验证

- 首次部署源码提交：`38d461e902fe44be493d454b11b988235c7543b0`。
- [GitHub Actions 部署](https://github.com/blockbloomer/lp-break-even-calculator/actions/runs/35183332287)构建和部署均成功；本机及云端的24项计算测试、类型检查、lint和构建通过。
- 公网匿名访问返回 HTTP 200，浏览器正常加载。1:9按钮联动为500美元买币目标、502.01美元含磨损支出、100.59美元待覆盖；APR 100,000%正常显示结果，之后已恢复示例。浏览器无错误日志。
- 此次追加仅记录验证证据，使用 `[skip ci]` 避免重复部署未改变的网站。
