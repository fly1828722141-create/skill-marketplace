# alicode-pages-deploy

- slug: `alicode-pages-deploy-mo8e91zgz6k2`
- uploaded_at: 2026-04-21T09:00:52.685Z
- package: alicode-pages-deploy.skill.zip

## Summary

用于部署静态网站到 AliCode Pages 的 skill。

## Description

1. 完整的 5 步部署流程
准备仓库（克隆 + 配置阿里邮箱）
添加文件（HTML 入口 + 图片等资源）
创建部署配置（.aoneci/deploy-pages.yaml）
在 AliCode 启用 Pages 并配置站点名称
验证部署（通过 curl 检查 HTTP 200）

2. 图片管理规范
统一放 images/ 目录
使用相对路径引用
避免绝对路径和外部 URL

3. 问题排查体系
部署失败快速处理：优先重新部署（添加 README 触发），90% 的问题可通过重试解决
深度排查：检查仓库可见性、YAML 配置、CI 日志
404 错误对照表：私有仓库、缺少配置、部署中、名称冲突、CI 失败
图片不显示排查：路径错误、未上传、大小写问题

4. 边界情况处理
非 main 分支的适配
站点名称规范（小写字母、数字、连字符，3-63 字符）
仓库可见性修改步骤

5. 最佳实践与检查清单
入口文件始终用 index.html
部署后等待 3-5 分钟再验证
提供完整的快速部署检查清单（7 项）

触发场景：当你想把 HTML 文件、静态站点发布到线上，或者遇到 Pages 404、部署失败、图片不显示等问题时，可以调用这个 skill。

前置条件：仓库必须是公开或内部（私有仓库无法使用 Pages），且 Git 邮箱需使用阿里邮箱（如 xxx@alibaba-inc.com）。

## Install

```bash
npx skills add https://github.com/fly1828722141-create/skill-marketplace --skill alicode-pages-deploy-mo8e91zgz6k2
```

## Package URL

https://raw.githubusercontent.com/fly1828722141-create/skill-marketplace/main/skills/alicode-pages-deploy-mo8e91zgz6k2/alicode-pages-deploy.skill.zip
