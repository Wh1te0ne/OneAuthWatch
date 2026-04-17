# OneAuthWatch

[English](./README.en.md) | [简体中文](./README.zh-CN.md)

OneAuthWatch 是一个面向 AI 编码账号的本地优先认证、额度与同步工作台。

它把三部分整合到一个产品里：
- Windows 桌面端：读取本地 auth、刷新额度
- Go 服务端：负责存储、轮询刷新、远程查询
- 网页端：查看同步后的账号状态和服务端持续刷新的数据

## 核心特点

- 支持 Codex、Claude Code、Gemini
- 没有服务端时，桌面端也可以独立使用
- 服务端可以持续轮询并保留历史快照
- 桌面端可以把最新本地状态覆盖同步到服务器
- 网页端适合作为远程查看入口

## 仓库结构

- [`client/`](./client/)  
  React + Tauri 桌面应用
- [`server/`](./server/)  
  Go 后端、嵌入式网页、数据库和刷新任务

## 快速开始

桌面端开发：

```powershell
Set-Location .\client
npm.cmd install
npm.cmd run dev
```

桌面端安装包构建：

```powershell
Set-Location .\client
npm.cmd run tauri build
```

本地运行服务端：

```powershell
Set-Location .\server
go build -o .\oneauthwatch-server.exe .
.\oneauthwatch-server.exe --debugstdout
```

使用 Docker 运行服务端：

```powershell
Set-Location .\server
docker compose up -d --build
```

云服务器拉取部署：

```bash
cd /srv/oneauthwatch
docker compose -f docker-compose.ghcr.yml pull
docker compose -f docker-compose.ghcr.yml up -d
```

默认镜像地址：

- `ghcr.io/wh1te0ne/oneauthwatch-server:latest`

## 产品定位

- 桌面端负责本地操作和本地视角的数据刷新。
- 服务端负责历史刷新、远程查询和多环境可见性。
- 网页端更偏向远程查看，而不是替代桌面端。

## 参考说明

在产品探索和技术比较阶段，这个项目参考过：
- CodexAuthManager
- onWatch

现在这个仓库中的代码是 OneAuthWatch 自己的产品代码，而不是对参考项目的直接镜像。
