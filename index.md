---
layout: home

hero:
  name: WeqBot
  text: 独立 QQ bot 框架
  tagline: 自己登录、自己上线。不借 QQ 客户端的在线会话，对外说 OneBot v11。
  image:
    src: /brand/logo-2x.png
    alt: WeqBot
  actions:
    - theme: brand
      text: 下载与安装
      link: /guide/install
    - theme: alt
      text: 运行原理
      link: /architecture/
    - theme: alt
      text: OneBot 接口
      link: /onebot/
    - theme: alt
      text: GitHub
      link: https://github.com/weq-devs/WeqBot

features:
  - title: 自建上线（mode 2）
    details: 用 a1 凭据自己完成 quickLogin、注册、心跳与推送接收，不需要 QQ 客户端开着。
  - title: 不与 QQ 互踢
    details: 真机实测同账号可双端在线。但产品口径仍守「QQ 在线走借会话、QQ 离线才自建」，不做抢登录。
  - title: 一套事件契约
    details: 协议层解出的推送统一翻译成语义事件（BotEvent）。OneBot 适配层与嵌入宿主消费同一份。
  - title: 205 条 OneBot 动作
    details: 消息、群管理、群文件、闪传、互动、QQ 空间、账号 Web 等 13 个分组，入参与说明随代码自动同步。
  - title: 可嵌入 WeQ
    details: 作为 sidecar 子进程由 desktop 拉起，凭据走控制通道交付，一个进程只服务一个账号。
  - title: 纯 TypeScript
    details: 除 node 包外任何代码不加载原生产物，宿主打包时不会带进第二份 .node。
---

## 从这里开始

- 想跑起来 → [下载与安装](/guide/install)
- 想接 OneBot 客户端 → [接入与网络拓扑](/onebot/)
- 想读懂它怎么工作 → [项目架构](/architecture/)
- 想看事件格式 → [事件推送](/events/)

::: warning 版本状态

WeqBot 尚未发布，版本号 `0.0.0` 是占位。文档与代码同步演进，**已实现**与**尚未实现**
在正文里逐条标注，不靠页面是否存在来区分。

:::
