# alicode-pages-deploy（静态网站部署 ）

- slug: `alicode-pages-deploy-静态网站部署-momnznxc9zfn`
- uploaded_at: 2026-05-01T08:42:17.184Z
- package: alicode-pages-deploy.skill.zip

## Summary

本 Skill 提供将静态网站部署到 AliCode Pages 的完整指南，涵盖从仓库准备、文件组织、部署配置到问题排查的全流程操作说明。
支持 HTML 入口文件、图片资源管理，以及多种部署失败后的快速恢复方法。

## Description

适用场景
需要将 HTML 页面、单页应用或静态文档快速部署为可访问的在线站点
团队内部需要搭建轻量级的演示页面、项目文档站或临时展示页
部署失败后的快速排查与重新部署

使用方法
准备仓库：克隆 AliCode 仓库，配置阿里邮箱，确保仓库可见性为"公开"或"内部"
添加文件：将 index.html 作为入口文件放入仓库根目录，图片等资源统一放入 images/ 目录
创建配置：在仓库中创建 .aoneci/deploy-pages.yaml 部署配置文件
启用 Pages：访问仓库的 Pages 设置页面，启用并配置站点名称
验证部署：等待 3-5 分钟后访问站点地址，使用 curl -I 检查状态

核心要点
仓库可见性必须为"公开"或"内部"，私有仓库无法使用 Pages
入口文件必须为 index.html
图片引用使用相对路径 images/xxx.png
部署失败后优先尝试重新部署（添加 README 触发），90% 的问题可通过重试解决
重新部署后需等待 3-5 分钟再验证

问题排查支持
包含常见问题的快速处理方案，如 404 错误、图片不显示、Git 推送失败、部署失败深度排查等，提供对应的诊断步骤和解决方法。

## Install

```bash
npx skills add https://github.com/fly1828722141-create/skill-marketplace --skill alicode-pages-deploy-静态网站部署-momnznxc9zfn
```

## Package URL

https://raw.githubusercontent.com/fly1828722141-create/skill-marketplace/main/skills/alicode-pages-deploy-%E9%9D%99%E6%80%81%E7%BD%91%E7%AB%99%E9%83%A8%E7%BD%B2-momnznxc9zfn/alicode-pages-deploy.skill.zip
