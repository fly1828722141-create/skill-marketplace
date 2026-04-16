/**
 * Prisma Database Seed Script (SQLite for Local Development)
 * 
 * 创建测试用户和技能包数据
 * 使用方式：npx ts-node --compiler-options '{"module":"CommonJS"}' prisma/seed.dev.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 开始创建测试数据...');

  // ===========================================
  // 创建测试用户
  // ===========================================
  console.log('👤 创建测试用户...');

  const user1 = await prisma.user.upsert({
    where: { email: 'gongyan.gy@alibaba-inc.com' },
    update: {},
    create: {
      name: '龚艳 (尚凡)',
      email: 'gongyan.gy@alibaba-inc.com',
      department: '飞猪 - 大住宿 - 经营效能部',
      employeeId: '390599',
      avatar: 'https://gw.alicdn.com/tfs/TB1.3.XSpXXXXXXXVXXXXXXXXXX-192-192.png',
    },
  });

  const user2 = await prisma.user.upsert({
    where: { email: 'zhaohonggang.zhg@alibaba-inc.com' },
    update: {},
    create: {
      name: '赵鸿刚 (之奥)',
      email: 'zhaohonggang.zhg@alibaba-inc.com',
      department: '飞猪 - 大住宿 - 经营效能部',
      employeeId: '123456',
      avatar: 'https://gw.alicdn.com/tfs/TB1.3.XSpXXXXXXXVXXXXXXXXXX-192-192.png',
    },
  });

  const user3 = await prisma.user.upsert({
    where: { email: 'lulu.ll@alibaba-inc.com' },
    update: {},
    create: {
      name: '鹿陆',
      email: 'lulu.ll@alibaba-inc.com',
      department: '飞猪 - 大住宿 - 经营效能部',
      employeeId: '654321',
      avatar: 'https://gw.alicdn.com/tfs/TB1.3.XSpXXXXXXXVXXXXXXXXXX-192-192.png',
    },
  });

  console.log(`✅ 创建 ${[user1, user2, user3].length} 个测试用户`);

  // ===========================================
  // 创建测试技能包
  // ===========================================
  console.log('📦 创建测试技能包...');

  // 注意：SQLite 不支持数组，tags 使用逗号分隔的字符串
  const skills = [
    {
      title: 'Next.js 企业级开发模板',
      description: '包含完整的项目结构、TypeScript 配置、ESLint/Prettier 规则、API 路由示例等。适合快速搭建企业级应用。',
      tags: 'Next.js,TypeScript，企业开发',
      fileName: 'nextjs-enterprise-template.zip',
      fileSize: 5120000, // 5MB
      fileType: 'zip',
      authorId: user1.id,
    },
    {
      title: 'Prisma ORM 最佳实践',
      description: 'Prisma 在阿里巴巴内部项目的实战经验总结，包含数据库设计、性能优化、迁移策略等内容。',
      tags: 'Prisma,Database,ORM,PostgreSQL',
      fileName: 'prisma-best-practices.zip',
      fileSize: 1536000, // 1.5MB
      fileType: 'zip',
      authorId: user1.id,
    },
    {
      title: 'TypeScript 高级技巧',
      description: '深入理解 TypeScript 类型系统，掌握泛型、条件类型、映射类型等高级用法，提升代码质量。',
      tags: 'TypeScript，类型系统，编程技巧',
      fileName: 'typescript-advanced.tar.gz',
      fileSize: 3072000, // 3MB
      fileType: 'tar.gz',
      authorId: user2.id,
    },
    {
      title: '阿里云 FaaS 部署指南',
      description: '从零开始在阿里云 FaaS 平台部署 Node.js 应用的完整流程，包含环境配置、CI/CD、监控告警等。',
      tags: 'FaaS，云计算，DevOps，阿里云',
      fileName: 'faas-deployment-guide.zip',
      fileSize: 4096000, // 4MB
      fileType: 'zip',
      authorId: user3.id,
    },
    {
      title: 'React Hooks 完全手册',
      description: 'React Hooks 从入门到精通，包含 useState、useEffect、useContext 等基础 Hook 和自定义 Hook 实战。',
      tags: 'React,Hooks，前端开发',
      fileName: 'react-hooks-handbook.zip',
      fileSize: 2560000, // 2.5MB
      fileType: 'zip',
      authorId: user1.id,
    },
  ];

  for (const skillData of skills) {
    await prisma.skill.create({
      data: skillData,
    });
  }

  console.log(`✅ 创建 ${skills.length} 个测试技能包`);

  // ===========================================
  // 创建测试下载记录
  // ===========================================
  console.log('📥 创建测试下载记录...');

  const allSkills = await prisma.skill.findMany();
  
  // 让用户 1 下载用户 2 和用户 3 的技能
  await prisma.download.create({
    data: {
      userId: user1.id,
      skillId: allSkills.find(s => s.authorId === user2.id)!.id,
    },
  });

  await prisma.download.create({
    data: {
      userId: user1.id,
      skillId: allSkills.find(s => s.authorId === user3.id)!.id,
    },
  });

  console.log('✅ 创建测试下载记录完成');

  // ===========================================
  // 统计信息
  // ===========================================
  const userCount = await prisma.user.count();
  const skillCount = await prisma.skill.count();
  const downloadCount = await prisma.download.count();

  console.log('\n📊 数据库统计:');
  console.log(`   用户数：${userCount}`);
  console.log(`   技能包数：${skillCount}`);
  console.log(`   下载记录数：${downloadCount}`);
  console.log('\n✅ 测试数据创建完成！\n');
}

main()
  .catch((e) => {
    console.error('❌ 种子脚本执行失败:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
