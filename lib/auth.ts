/**
 * NextAuth.js 配置 - 阿里 BUC 单点登录集成
 * 
 * BUC (Basic User Center) 是阿里巴巴集团内部的统一认证系统
 */

import { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import axios from 'axios';

// ===========================================
// BUC 登录配置
// ===========================================
const BUC_CONFIG = {
  appKey: process.env.BUC_APP_KEY,
  appSecret: process.env.BUC_APP_SECRET,
  loginUrl: process.env.BUC_LOGIN_URL || 'https://login.alibaba-inc.com/buc/login',
  callbackUrl: process.env.BUC_CALLBACK_URL,
};

// ===========================================
// 验证 BUC 登录票据
// ===========================================
async function verifyBUCTicket(ticket: string) {
  try {
    // 注意：这是示例代码，实际的 BUC 验证接口需要参考内部文档
    const response = await axios.post(
      'https://api.alibaba-inc.com/buc/verify',
      {
        ticket,
        appKey: BUC_CONFIG.appKey,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${BUC_CONFIG.appSecret}`,
        },
      }
    );

    if (response.data.success) {
      return {
        id: response.data.user.employeeId,
        name: response.data.user.name,
        email: response.data.user.email,
        avatar: response.data.user.avatar,
        department: response.data.user.department,
        employeeId: response.data.user.employeeId,
      };
    }

    return null;
  } catch (error) {
    console.error('BUC 票据验证失败:', error);
    return null;
  }
}

// ===========================================
// NextAuth 配置选项
// ===========================================
export const authOptions: NextAuthOptions = {
  // 使用 JWT 模式（无数据库 session）
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 天
  },

  //  providers
  providers: [
    CredentialsProvider({
      name: 'BUC',
      credentials: {
        ticket: { label: 'Login Ticket', type: 'text' },
      },
      async authorize(credentials) {
        if (!credentials?.ticket) {
          throw new Error('缺少登录票据');
        }

        const user = await verifyBUCTicket(credentials.ticket);

        if (!user) {
          throw new Error('登录票据无效或已过期');
        }

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.avatar,
          department: user.department,
          employeeId: user.employeeId,
        };
      },
    }),
  ],

  // 回调函数
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.department = user.department;
        token.employeeId = user.employeeId;
      }
      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.department = token.department as string;
        session.user.employeeId = token.employeeId as string;
      }
      return session;
    },
  },

  // 页面配置
  pages: {
    signIn: '/login',
    error: '/login',
  },

  // 调试模式（开发环境启用）
  debug: process.env.NODE_ENV === 'development',

  // 事件处理
  events: {
    async signIn({ user }) {
      console.log('用户登录成功:', user.email);
    },
    async signOut({ token }) {
      console.log('用户登出:', token.email);
    },
  },
};

// ===========================================
// 扩展 Session 类型
// ===========================================
declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      name: string;
      email: string;
      image?: string;
      department?: string;
      employeeId?: string;
    };
  }

  interface User {
    department?: string;
    employeeId?: string;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string;
    department?: string;
    employeeId?: string;
  }
}
